import { Injectable } from '@nestjs/common';
import { UsersRepository } from '../users/users.repository';
import { RegisterDto } from './register.dto';
import { NotificationService } from '../notifications/notification.service';

/**
 * 인증 및 유저 라이프사이클 비즈니스 로직 서비스
 *
 * @description
 * User 도메인과 Notification 도메인 간의 로직 흐름을 조율(Orchestration)합니다.
 * 현재는 서비스 간 직접 주입(Direct Injection) 방식을 사용하고 있으나,
 * 향후 도메인 간 결합도를 낮추기 위해 NestJS의 EventEmitter를 활용한 
 * 이벤트 기반 아키텍처(EDA, Event-Driven Architecture)로의 전환을 고려해야 합니다.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * 유저 데이터 생성 및 온보딩 프로세스(알림 스케줄링) 진입점
   *
   * @todo [트랜잭션(Transaction) 설계 이슈]
   * 현재 로직은 유저 생성 완료 후 알림 스케줄링을 순차적으로 수행합니다.
   * 만약 유저 저장은 성공했지만 스케줄링 저장 과정에서 DB 장애가 발생할 경우, 
   * 데이터 정합성이 깨지는 부분 실패(Partial Failure) 상태가 발생할 수 있습니다.
   * 이를 방지하기 위해 TypeORM의 QueryRunner를 활용하여 두 작업을 단일 트랜잭션으로 묶거나(Atomicity 보장),
   * 보상 트랜잭션(Saga Pattern)을 설계하는 방향으로 개선이 필요합니다.
   */
  async register(input: RegisterDto) {
    // 1. 유저 메타데이터 영속성 보장 (DB Insert)
    const user = await this.usersRepository.create(input);
    
    // 2. 가입 후속 조치(알림 예약) 수행 대기
    await this.notificationService.scheduleOnboardingMessages(user);

    return { id: user.id, name: user.name, email: user.email };
  }

  /**
   * 논리적 회원 탈퇴 (Soft Delete) 처리
   *
   * @description
   * 복구 및 운영 로그 보존(CS 대응 등)을 위해 레코드를 물리적으로 삭제하지 않습니다.
   * * [설계 의도: 느슨한 결합(Loose Coupling)]
   * 여기서 탈퇴 처리 시 해당 유저의 대기 중인 알림 스케줄을 찾아 지우는(Delete) 로직을 추가하지 않았습니다.
   * Auth 도메인이 Notification 도메인의 내부 스키마를 몰라도 되게끔 책임을 분리했기 때문입니다.
   * 대신 Notification 도메인의 스케줄러(Cron)가 발송 직전 탈퇴 여부를 검증(Double-Check)하여
   * 스스로 발송을 취소(Skipped)하도록 설계하여 도메인 간 독립성을 확보했습니다.
   */
  async withdraw(email: string) {
    await this.usersRepository.softDeleteByEmail(email);
    return { message: '탈퇴가 완료되었습니다.' };
  }
}