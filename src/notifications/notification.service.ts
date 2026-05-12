import { Injectable, Logger } from '@nestjs/common';
import { User } from '../users/user.model';
import { UsersRepository } from '../users/users.repository';
import { NotificationRepository } from './notification.repository';
import { MockAlimtalkProvider } from './alimtalk.provider';
import { NotificationTemplateCode } from './notification.model';
import { ConfigService } from '@nestjs/config';

/**
 * 타임라인 스케일링 상수
 * @description 현재는 QA 및 시연의 편의를 위해 1분을 1일(Day)로 치환하여 사용 중입니다.
 * 운영(Production) 배포 시에는 반드시 24 * 60 * 60 * 1000 (1일)로 변경하거나,
 * 하드코딩을 피하기 위해 Time Utils나 .env 설정으로 분리하는 것이 바람직합니다.
 */
const MINUTE = 60 * 1000; 

/**
 * 온보딩 발송 정책 (Policy)
 * @description 로직(Mechanism)과 정책(Policy)을 분리하여 데이터 주도(Data-driven) 방식으로 설계했습니다.
 * 기획 및 마케팅 팀에서 'D+21일 알림을 추가해 달라'고 요청할 경우, 
 * 복잡한 핵심 서비스 로직을 건드릴 필요 없이 이 배열에 요소 하나만 추가하면 즉시 반영됩니다.
 */
const ONBOARDING_STEPS: Array<{ templateCode: NotificationTemplateCode; delayMinutes: number; intervalDays?: number }> = [
  { templateCode: 'ONBOARDING_WELCOME', delayMinutes: 0 },
  { templateCode: 'ONBOARDING_D3', delayMinutes: 3 },
  { templateCode: 'ONBOARDING_D6', delayMinutes: 7 },
  { templateCode: 'ONBOARDING_D14', delayMinutes: 14, intervalDays: 14 }
];

/**
 * 알림 발송 오케스트레이션 서비스
 * @description 예약 생성, 발송 대상 추출, 외부 연동, 에러 재시도 등 알림 도메인의 핵심 비즈니스 흐름을 제어합니다.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly MAX_RETRY: number; 

  constructor(
    private readonly repository: NotificationRepository,
    private readonly usersRepository: UsersRepository, 
    private readonly provider: MockAlimtalkProvider,
    private readonly configService: ConfigService
  ) {
    this.MAX_RETRY = this.configService.get<number>('ALIMTALK_RETRY_LIMIT', 3);
  }

  /**
   * 신규 가입 유저 온보딩 알림 일괄 예약
   *
   * @description
   * [설계 의도: 감사(Audit) 및 CS 대응을 위한 레코드 적재 전략]
   * 수신 거부자나 번호 누락자의 경우 아예 DB에 넣지 않는 것이 스토리지 효율 측면에서는 유리할 수 있습니다.
   * 하지만 실무에서는 "왜 특정 고객에게 가입 환영 메시지가 발송되지 않았는가?"라는 CS 인입 시 명확한 근거가 필요합니다.
   * 따라서 발송 대상이 아니더라도 상태를 'skipped'로 마킹하여 DB에 밀어 넣음으로써,
   * 시스템의 모든 판단 이력을 남기는(Audit Trail) 무결성 중심의 설계를 취했습니다.
   */
  async scheduleOnboardingMessages(user: User) {
    const base = user.createdAt;
    
    return ONBOARDING_STEPS.map((step) => {
      const isSkipped = !user.phone || !user.agreeMarketingReceiveSms;
      
      return this.repository.create({
        userId: user.id,
        phone: user.phone,
        templateCode: step.templateCode,
        variables: { 
          userName: user.name,
          guideLink: 'https://www.momgleedu.com/notice/1' 
        },
        scheduledAt: new Date(base.getTime() + step.delayMinutes * MINUTE),
        status: isSkipped ? 'skipped' : 'pending' ,
        intervalDays: step.intervalDays
      });
    });
  }

  /**
   * 스케줄링된 발송 대기열(Queue) 일괄 처리
   *
   * @description
   * 스케줄러(Cron)에 의해 주기적으로 호출되는 워커(Worker) 메서드입니다.
   * 처리 도중 특정 레코드에서 외부 통신 에러가 발생하더라도 전체 루프가 중단(Crash)되지 않도록,
   * 각 레코드 단위로 철저하게 예외 처리(Try-Catch)와 상태 전이를 보장하도록 설계되었습니다.
   */
async sendDueMessages(now = new Date()) {
    const dueRows = await this.repository.findDue(now);
    const results = [];

    for (const row of dueRows) {
      const user = await this.usersRepository.findById(row.userId);
      
      if (!user || user.deletedAt || !user.agreeMarketingReceiveSms) {
        this.logger.log(`알림 스킵 처리됨 (유저 탈퇴 또는 동의 철회) - UserID: ${row.userId}`);
        results.push(await this.repository.updateStatus(row.id, 'skipped', { lastError: 'user_opted_out_or_deleted' }));
        continue;
      }

      if (row.attemptCount >= this.MAX_RETRY) {
        results.push(await this.repository.updateStatus(row.id, 'failed', { lastError: 'max_retry_exceeded' }));
        continue;
      }

      try {
        await this.provider.send({
          phone: row.phone ?? '',
          templateCode: row.templateCode,
          variables: row.variables
        });
        
        // 1. 현재 알림 발송 성공 처리
        results.push(await this.repository.updateStatus(row.id, 'sent', { sentAt: new Date() }));

        /**
         * [꼬리물기 패턴 (Self-Chaining Schedule)]
         * 발송 성공 후, 해당 알림 정책에 반복 주기(intervalDays)가 설정되어 있다면
         * 현재 예약 기준일(scheduledAt)에 주기를 더해 다음 회차의 스케줄을 큐(Queue)에 적재합니다.
         * 만약 유저가 다음 발송 전에 탈퇴하거나 수신을 거부하더라도, 
         * 상단의 지연 검증(Double-Check) 로직이 알아서 skipped 처리하므로 안전합니다.
         */
        if (row.intervalDays) {
          // 시연을 위해 분(MINUTE) 단위로 테스트하시려면 row.intervalDays * MINUTE 로 변경하세요.
          // 실무에서는 row.intervalDays * DAY 를 사용합니다.
          const nextScheduledAt = new Date(row.scheduledAt.getTime() + (row.intervalDays * MINUTE));
          
          await this.repository.create({
            userId: row.userId,
            phone: row.phone,
            templateCode: row.templateCode, 
            variables: row.variables,
            scheduledAt: nextScheduledAt,
            status: 'pending',
            intervalDays: row.intervalDays // 다음 발송 성공 시 또 생성될 수 있도록 속성 유지
          });
          
          this.logger.log(`[반복 스케줄링] UserID: ${row.userId}, 다음 발송일: ${nextScheduledAt.toISOString()}`);
        }
      } catch (error) {
        /**
         * [장애 대응 및 재시도(Retry) 메커니즘]
         * 네트워크 지연, 카카오톡 서버의 일시적 장애(5xx) 발생 시 로직이 다운되지 않도록 에러를 캐치합니다.
         * 상태를 failed로 즉시 바꾸지 않고 pending을 유지하되, attemptCount만 1 증가시킴으로써
         * 다음 스케줄러 주기에 자연스럽게 재시도되도록 비동기 큐의 탄력성(Resilience)을 확보했습니다.
         */
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`발송 실패 (재시도 예정) - 알림 ID: ${row.id}, 에러: ${errorMessage}`);
        
        results.push(
          await this.repository.updateStatus(row.id, 'pending', { 
            attemptCount: row.attemptCount + 1,
            lastError: errorMessage
          })
        );
      }
    }
    return results;
  }

  /**
   * 전체 알림 내역 조회 (Admin)
   * @description Admin 컨트롤러를 위한 단순 프록시(Proxy) 메서드입니다.
   */
  findAll() {
    return this.repository.findAll();
  }
}