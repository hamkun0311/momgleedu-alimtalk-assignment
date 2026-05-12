import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';
import { CreateUserInput } from './user.model';

/**
 * 유저 데이터 접근 계층 (Custom Repository)
 *
 * @description
 * TypeORM의 기본 Repository를 직접 주입받아 사용하지 않고 한 번 래핑(Wrapping)한 클래스입니다.
 * 이를 통해 서비스 레이어(비즈니스 로직)가 TypeORM이라는 특정 인프라 기술에 강하게 결합되는 것을 막고,
 * 도메인 관점에서 필요한 데이터 접근 메서드(create, findById 등)만 제한적으로 노출하여 캡슐화를 강화합니다.
 * 또한 향후 단위 테스트(Unit Test) 작성 시 모킹(Mocking) 객체를 생성하기 훨씬 수월해지는 장점이 있습니다.
 */
@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  /**
   * 신규 유저 레코드 생성
   *
   * @todo [예외 변환 (Exception Translation) 처리]
   * 현재는 DB 저장 로직만 존재하지만, UserEntity의 email 컬럼에는 unique 제약조건이 걸려 있습니다.
   * 동시에 동일한 이메일로 가입 요청이 들어오거나(Race Condition), 이미 존재하는 이메일로 요청 시 
   * TypeORM은 데이터베이스 단의 예외인 QueryFailedError(ER_DUP_ENTRY)를 발생시킵니다.
   * 실무에서는 이 메서드 내부에서 해당 DB 에러를 캐치(catch)하여, 
   * 클라이언트나 상위 컨트롤러가 이해할 수 있는 비즈니스 예외(예: UserAlreadyExistsException)로 
   * 변환해서 던져주는 방어 로직이 반드시 추가되어야 합니다.
   */
  async create(input: CreateUserInput): Promise<UserEntity> {
    const user = this.repository.create(input);
    return await this.repository.save(user);
  }

  /**
   * 식별자(PK) 기반 유저 단건 조회
   *
   * @description
   * 알림 스케줄러 등에서 발송 직전 유저의 최신 상태(탈퇴 여부, 수신 동의 여부)를 
   * 지연 검증(Double-Check)할 때 주로 호출되는 핵심 읽기(Read) 메서드입니다.
   * PK(id)를 기반으로 한 조회이므로 클러스터링 인덱스를 타게 되어 속도가 매우 빠르지만,
   * 향후 트래픽이 극단적으로 증가하여 DB 커넥션 부하가 심해질 경우, 
   * 이 구간에 Redis 기반의 Look-aside 캐싱 전략 도입을 1순위로 고려해 볼 수 있습니다.
   */
  async findById(id: number): Promise<UserEntity | null> {
    return await this.repository.findOneBy({ id });
  }

  /**
   * 이메일 기반 논리적 회원 탈퇴 (Soft Delete)
   *
   * @description
   * TypeORM의 softDelete 메서드를 사용하여 레코드를 물리적으로 지우지(DELETE 쿼리) 않고 
   * deletedAt 컬럼에 현재 시간만 업데이트(UPDATE 쿼리)합니다.
   * 이를 통해 유저가 남긴 결제 내역, 알림 발송 히스토리 등 타 테이블과의 외래키(FK) 참조 무결성을 유지하며,
   * 향후 개인정보보호법에 따른 유예 기간 보존 및 오작동에 의한 CS 복구 인입 시 데이터 복원을 가능하게 합니다.
   * * [보안 및 성능 주의] 현재 과제 스펙상 이메일을 기준으로 탈퇴를 수행하고 있으나, 
   * 이메일 변경 기능이 도입되거나 인덱스 성능 최적화가 필요해질 경우 PK(id) 기반 삭제로 리팩토링하는 것이 더욱 안전합니다.
   */
  async softDeleteByEmail(email: string): Promise<void> {
    await this.repository.softDelete({ email });
  }
}