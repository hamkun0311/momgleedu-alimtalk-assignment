/**
 * 순수 유저 도메인 모델 (Pure Domain Model)
 *
 * @description
 * TypeORM 엔티티(UserEntity)와는 별개로, 비즈니스 로직(Service)에서 다루는 순수 객체 타입입니다.
 * * [설계 의도: 인프라스트럭처 종속성 제거]
 * 서비스 레이어가 특정 ORM(TypeORM)의 Entity 객체를 직접 다루게 되면, 향후 ORM 프레임워크를 교체하거나
 * 단위 테스트를 작성할 때 강결합으로 인한 유지보수 비용이 급증합니다.
 * 이를 방지하기 위해 데이터베이스 스키마와 무관한 순수 TypeScript 객체(POJO)를 정의하여,
 * 도메인 레이어의 독립성과 테스트 용이성을 확보하는 아키텍처적 결단입니다.
 */
export type User = {
  id: number;
  name: string;
  email: string;
  phone?: string;
  
  /**
   * 컴플라이언스(정보통신망법) 기준 동의 여부 상태값
   */
  agreeMarketingReceiveSms: boolean;
  
  /**
   * 탈퇴 상태 플래그 (Soft Delete 식별용)
   * @description 이 값이 존재하면(Not Undefined) 해당 유저는 비즈니스 로직 상 비활성화된 상태로 취급됩니다.
   */
  deletedAt?: Date;
  
  createdAt: Date;
};

/**
 * 유저 생성 커맨드 / 입력 명세 (Create User Command)
 *
 * @description
 * 신규 유저 생성 비즈니스 로직(Service.register)에 전달되는 파라미터의 타입 명세입니다.
 * * [설계 의도: Mass Assignment (데이터 과할당) 방어]
 * 데이터베이스에서 자동 채번되는 id, 로직 내부에서 주입되어야 하는 createdAt, deletedAt 등의
 * 제어권 밖의 필드들을 입력 인터페이스에서 의도적으로 배제했습니다.
 * 이를 통해 클라이언트나 상위 컨트롤러 레이어에서 의도치 않게 PK나 시스템 컬럼을 덮어씌우는
 * 심각한 보안 취약점을 컴파일 타임에 원천 차단합니다.
 */
export type CreateUserInput = {
  name: string;
  email: string;
  phone?: string;
  agreeMarketingReceiveSms: boolean;
};