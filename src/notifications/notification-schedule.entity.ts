import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm'; 
import { NotificationStatus, NotificationTemplateCode } from './notification.model';
import { UserEntity } from '../users/user.entity'; 

/**
 * 알림 발송 스케줄 및 이력 관리 엔티티 (Database as a Queue)
 *
 * @description
 * 비동기 알림 발송을 위한 대기열(Queue)이자, 발송 결과를 영구 보존하는 로그(Log) 테이블의 역할을 동시에 수행합니다.
 * * @note [설계 의도: 멱등성(Idempotency) 보장]
 * 클라이언트의 재요청 버그나 이벤트 중복 발행으로 인해 동일한 유저에게 동일한 온보딩 알림이
 * 여러 번 스케줄링되는 대참사(스팸 발송)를 DB 레벨의 유니크 제약조건을 통해 원천 차단합니다.
 */
@Entity('notification_schedules')
export class NotificationScheduleEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  /**
   * 유저 도메인과의 연관관계 (N:1)
   * * @description
   * JoinColumn을 명시하여 물리적인 외래키(FK) 관계를 맺습니다.
   * 관리자 API 등에서 발송 이력을 조회할 때 Eager/Lazy Loading을 통해 유저 정보를 효율적으로 가져오기 위함입니다.
   * 실무에서는 N+1 쿼리 문제가 발생하지 않도록 QueryBuilder나 find 옵션에서 relations를 신중하게 제어해야 합니다.
   */
  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  /**
   * 수신 연락처
   * * @description
   * User 테이블에 이미 번호가 있음에도 이곳에 중복 저장(비정규화, Denormalization)하는 이유는 '스냅샷(Snapshot)' 때문입니다.
   * 유저가 알림 예약 후 전화번호를 변경하거나 탈퇴하더라도, '예약 당시의 타겟팅 정보'를 
   * 히스토리로 남겨두어 정확한 CS 대응 및 감사(Audit) 추적을 가능하게 합니다.
   */
  @Column({ nullable: true })
  phone?: string;

  @Column()
  templateCode!: NotificationTemplateCode;

  /**
   * 템플릿 치환용 동적 데이터
   * * @description
   * RDBMS의 정적 스키마 한계를 극복하기 위해 JSON 타입을 채택했습니다.
   * 템플릿마다 필요한 변수(userName, link, point 등)의 규격이 다르더라도, 
   * DDL(Data Definition Language) 변경 없이 유연하게 데이터를 적재하고 확장할 수 있습니다.
   */
  @Column('json')
  variables!: Record<string, string>;


  /**
   * 반복 발송 주기 (일 단위)
   *
   * @description
   * 이 값이 존재하는 스케줄은 1회성 발송으로 끝나지 않고, 발송 성공 직후 
   * 이 주기만큼 더해진 새로운 스케줄을 대기열에 생성(Chaining)합니다.
   * 코드가 아닌 DB 데이터를 기반으로 반복 여부를 결정하는 Data-driven 설계입니다.
   */
  @Column({ nullable: true })
  intervalDays?: number;

  /**
   * 발송 예정 일시
   * * @note [성능 최적화: Polling 성능 보장]
   * @Index() 단일 인덱스가 적용되어 있습니다. 
   * 스케줄러(Cron)가 매 분마다 `scheduledAt <= NOW()` 조건으로 대기열을 조회(Polling)할 때,
   * 이 인덱스가 없다면 테이블 풀 스캔(Full Table Scan)이 발생하여 DB CPU에 심각한 부하를 초래합니다.
   */
  @Column()
  @Index()
  scheduledAt!: Date;

  /**
   * 상태 머신 (State Machine)
   * pending -> sent / failed / skipped 의 단방향 상태 흐름을 가집니다.
   */
  @Column({ default: 'pending' })
  status!: NotificationStatus;


  /**
   * 발송 시도 횟수 (Fault Tolerance)
   * * @description
   * 외부 통신(카카오 API 등)은 언제든 실패할 수 있다는 가정(Design for Failure) 하에 설계되었습니다.
   * 실패 시 상태를 바로 failed로 바꾸지 않고 attemptCount를 증가시키며,
   * 설정된 MAX_RETRY 한계치에 도달했을 때만 최종 실패 처리하여 시스템의 탄력성(Resilience)을 높입니다.
   */
  @Column({ default: 0 })
  attemptCount!: number;

  /**
   * 최종 실패 사유
   * * @description
   * 발송 실패 원인(네트워크 타임아웃, 토큰 만료, 잔액 부족 등)을 기록하여
   * 인프라 장애인지 비즈니스 로직 오류인지 빠르게 디버깅할 수 있도록 돕습니다.
   */
  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ nullable: true })
  sentAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}