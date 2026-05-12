import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, DeleteDateColumn } from 'typeorm';

/**
 * 유저 도메인 엔티티 (Database Schema)
 *
 * @description
 * 서비스의 가장 핵심이 되는 유저 마스터 테이블입니다.
 * 인증(Auth), 알림(Notification), 결제 등 시스템 전반의 서브 도메인에서 이 테이블을 참조하므로,
 * 컬럼이나 제약조건 추가 시 사이드 이펙트를 최소화할 수 있도록 보수적으로 설계되어야 합니다.
 */
@Entity('users')
export class UserEntity {
  /**
   * 대리 키 (Surrogate Key)
   * * @description
   * 인덱스 크기 및 조인 성능을 고려하여 Auto Increment 방식의 정수형 PK를 사용했습니다.
   * 단, 향후 마이크로서비스(MSA)로 완전히 분리하거나 분산 데이터베이스 환경으로 스케일 아웃을 진행할 경우,
   * Auto Increment 채번의 병목을 막기 위해 UUID(v4 또는 순차 생성되는 v7) 도입을 검토해야 합니다.
   */
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  /**
   * 고유 로그인 식별자 (이메일)
   * * @description
   * 애플리케이션 레벨의 DTO 검증뿐만 아니라, DB 레벨에 { unique: true } 제약조건을 강제했습니다.
   * 이는 악의적인 클라이언트나 네트워크 지연으로 인해 동시에 여러 번의 가입 요청(Race Condition)이 인입되더라도,
   * 중복 계정이 생성되는 심각한 데이터 정합성 훼손을 막아주는 최후의 방어선입니다.
   */
  @Column({ unique: true })
  email!: string;

  /**
   * 연락처
   * * @description
   * 맨 앞자리의 '0'이 유실되지 않도록 INT가 아닌 String 타입으로 관리합니다.
   * 현재 가입 시 필수가 아니므로 nullable 처리를 하였으나,
   * 향후 중복 가입을 막기 위한 본인 인증 로직(KCB, NICE 등)이 추가된다면, 빈 문자열 제어 및 unique 인덱스 추가를 신중히 고려해야 합니다.
   */
  @Column({ nullable: true })
  phone?: string; 

  /**
   * 마케팅 및 알림톡 수신 동의 여부 (Compliance)
   * * @description
   * 정보통신망법 등 개인정보보호 관련 법규 준수를 위해 기본값은 무조건 false(미동의)로 설정합니다(Opt-in 방식).
   * 알림 스케줄러(Worker)는 예약된 데이터가 있더라도 발송 직전 항상 이 컬럼을 다시 조회하여,
   * 동의가 철회된 상태라면 발송을 중단함으로써 불법 스팸 발송 리스크를 차단합니다.
   */
  @Column({ default: false })
  agreeMarketingReceiveSms!: boolean;

  /**
   * 가입 일시
   * @description 온보딩 스케줄러가 D+3, D+7 등의 알림 발송 기준 시점(Base Time)으로 사용하는 중요 컬럼입니다.
   */
  @CreateDateColumn()
  createdAt!: Date;

  /**
   * 논리적 삭제 처리 (Soft Delete)
   * * @description
   * 유저가 회원 탈퇴를 요청하더라도 레코드를 DB에서 즉시 물리적으로 삭제(DELETE)하지 않습니다.
   * 연관된 알림 이력, 결제 로그 등의 참조 무결성(Referential Integrity)을 보호하고,
   * CS 대응 및 법적 보존 기간 동안 데이터를 보관하기 위해 삭제 일시만 기록합니다.
   * TypeORM은 이 데코레이터가 존재하면 내부적으로 쿼리를 가로채어 'WHERE deletedAt IS NULL' 조건을 
   * 애플리케이션 레벨에서 자동으로 주입해 줍니다.
   */
  @DeleteDateColumn()
  deletedAt?: Date;
}