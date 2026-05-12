import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

/**
 * 알림 발송 백그라운드 스케줄러 (Worker)
 *
 * @description
 * 사용자의 액션(API 요청)과 무관하게, 서버 백그라운드에서 주기적으로 발송 대기열(Queue)을
 * 폴링(Polling)하여 처리하는 엔트리포인트(진입점)입니다.
 * * @todo [Scale-out (다중 서버) 배포 시 주의사항]
 * 현재는 단일 서버(Single Instance) 환경을 가정하고 작성되었습니다.
 * 만약 트래픽 증가로 인해 서버 인스턴스를 2대 이상으로 늘릴 경우, 
 * 모든 서버에서 동시에 이 Cron이 실행되어 동일한 대기열을 조회하고 발송하는 '중복 발송' 대참사가 발생할 수 있습니다.
 * 이를 방지하기 위해 다중 인스턴스 환경에서는 Redis 기반의 분산 락(Distributed Lock)을 도입하거나,
 * TypeORM 조회 시 비관적 락(Pessimistic Lock: FOR UPDATE SKIP LOCKED)을 적용하여 동시성 제어를 해야 합니다.
 */
@Injectable()
export class NotificationCron {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 주기적 발송 트리거
   * * @description
   * 소스코드에 주기를 하드코딩하지 않고 환경변수(process.env)를 주입받아 유연성을 확보했습니다.
   * 이를 통해 로컬/개발 서버에서는 30초마다, 운영(Production) 서버에서는 1분마다 동작하도록
   * 배포 환경에 맞춰 스케줄링 주기를 동적으로 제어할 수 있습니다.
   * * @todo [작업 지연(Overlap) 방어]
   * 만약 DB 누적 데이터가 많거나 카카오 API 응답이 지연되어 sendDueMessages() 실행에 1분 이상 소요된다면,
   * 이전 주기의 발송 작업이 끝나기도 전에 다음 주기의 스케줄러가 또 실행되는 오버랩(Overlap) 현상이 발생합니다.
   * 실무에서는 이 메서드 진입 시 isRunning 플래그를 체크하거나, NestJS Task Scheduling의 
   * 오버랩 방지 로직을 추가하여 단일 스레드 안전성(Thread-safety)을 확보하는 것이 권장됩니다.
   */
  @Cron(process.env.ALIMTALK_CRON || '0 * * * * *') 
  handleCron() {
    this.notificationService.sendDueMessages();
  }
}