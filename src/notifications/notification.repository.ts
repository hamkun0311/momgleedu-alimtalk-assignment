import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { NotificationScheduleEntity } from './notification-schedule.entity';
import { NotificationStatus } from './notification.model';

/**
 * 알림 스케줄 데이터 접근 계층 (Repository Pattern)
 *
 * @description
 * TypeORM의 기본 Repository를 한 번 더 래핑(Wrapping)한 커스텀 리포지토리입니다.
 * 비즈니스 로직(Service)이 ORM(TypeORM)의 세부 구현에 강하게 결합되는 것을 방지하고,
 * 단위 테스트 시 모킹(Mocking)을 용이하게 하기 위한 아키텍처 관점의 추상화 계층입니다.
 */
@Injectable()
export class NotificationRepository {
  constructor(
    @InjectRepository(NotificationScheduleEntity)
    private readonly repository: Repository<NotificationScheduleEntity>,
  ) {}

  /**
   * 단일 스케줄 레코드 생성
   *
   * @todo [Bulk Insert 및 예외 처리 고려]
   * 현재는 가입 시 4개의 알림을 개별적으로 create & save 하고 있습니다.
   * 트래픽이 많을 경우 DB 커넥션을 낭비할 수 있으므로 repository.insert()를 활용한 Bulk Insert 전환을 고려해야 합니다.
   * 또한 Entity 단에 설정된 Unique 제약조건(userId, templateCode) 위반 시 발생하는
   * QueryFailedError(ER_DUP_ENTRY)를 캐치하여 비즈니스 예외로 변환하는 방어 로직이 추가되면 더 안전합니다.
   */
  async create(input: Partial<NotificationScheduleEntity>): Promise<NotificationScheduleEntity> {
    const schedule = this.repository.create(input);
    return await this.repository.save(schedule);
  }

  /**
   * 발송 대상 대기열 조회 (Polling)
   *
   * @description
   * 스케줄러(Cron)가 주기적으로 호출하여 발송해야 할 대상(pending)을 가져옵니다.
   * * @todo [다중 서버 환경에서의 동시성 제어]
   * 서버가 스케일 아웃(Scale-out)되어 2대 이상 동작할 경우, 두 인스턴스의 Cron이 
   * 동시에 이 메서드를 호출하여 동일한 레코드를 중복 조회할 위험이 큽니다.
   * 운영 환경에서는 비관적 락(Pessimistic Lock)인 'FOR UPDATE SKIP LOCKED' 옵션을 
   * QueryBuilder에 적용하여, 한 서버가 획득한 레코드를 다른 서버가 건너뛰도록 제어해야 합니다.
   */
  async findDue(now = new Date()): Promise<NotificationScheduleEntity[]> {
    return await this.repository.find({
      where: {
        status: 'pending',
        scheduledAt: LessThanOrEqual(now),
      },
    });
  }

  /**
   * 상태 및 부가 정보(에러 메시지 등) 부분 업데이트
   *
   * @description
   * 전체 엔티티를 save()로 덮어씌우지 않고, update()를 사용하여 필요한 컬럼만 원자적(Atomic)으로 변경합니다.
   * 이는 다른 스레드나 프로세스가 동시에 해당 레코드를 수정하고 있을 때 발생할 수 있는 
   * 동시성 업데이트 이슈(Lost Update)를 최소화하기 위한 실무적인 접근입니다.
   */
  async updateStatus(id: number, status: NotificationStatus, patch: Partial<NotificationScheduleEntity> = {}) {
    await this.repository.update(id, { ...patch, status });
    return await this.repository.findOneBy({ id });
  }

  /**
   * 어드민용 전체 발송 이력 및 예약 현황 조회
   *
   * @description
   * relations: ['user'] 옵션을 통해 연관된 유저 데이터를 조인(Join)하여 한 번의 쿼리로 가져옵니다.
   * * @todo [성능 및 리소스 고갈(OOM) 리스크]
   * WHERE 조건이나 LIMIT(Pagination) 없이 find()를 호출하는 것은 매우 위험한 안티 패턴입니다.
   * 데이터가 수만 건만 넘어가도 DB I/O 병목 및 Node.js 프로세스의 메모리 부족(OOM) 장애를 유발합니다.
   * 어드민 API이더라도 반드시 limit, offset 기반의 페이징이나 Cursor 기반 페이징을 적용해야 합니다.
   */
  async findAll(): Promise<NotificationScheduleEntity[]> {
    return await this.repository.find({
      relations: ['user'], 
      order: {
        scheduledAt: 'ASC'
      }
    });
  }
}