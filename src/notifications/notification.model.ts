/**
 * 알림 발송 상태 머신 (State Machine) 정의
 *
 * @description
 * 단순 문자열(string)이 아닌 리터럴 유니언(Literal Union) 타입을 사용하여 컴파일 타임에 안전성을 보장합니다.
 * 알림은 발송 대기(pending) 상태에서 시작하여, 발송 성공(sent), 재시도 초과로 인한 최종 실패(failed), 
 * 혹은 발송 조건 미달로 인한 취소(skipped)라는 명확하고 제한된 라이프사이클을 갖도록 강제합니다.
 */
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * 알림톡 템플릿 식별자 정의
 *
 * @description
 * 시스템에서 허용하는 템플릿 식별자를 하드코딩된 매직 스트링(Magic String)이 아닌 타입으로 관리하여
 * 오타로 인한 런타임 장애(DB 적재 실패, 템플릿 조립 실패 등)를 원천 차단합니다.
 * 향후 기획 추가로 새로운 템플릿이 도입될 경우, 이 유니언 타입에만 추가해 주면 
 * TypeScript의 Exhaustiveness Check(망라성 검사) 기능이 작동하여 AlimtalkProvider의 switch 문 등에서
 * 처리 로직이 누락된 부분을 컴파일러가 사전에 경고해 줍니다.
 */
export type NotificationTemplateCode =
  | 'ONBOARDING_WELCOME'
  | 'ONBOARDING_D3'
  | 'ONBOARDING_D6'
  | 'ONBOARDING_D14';

/**
 * 알림 스케줄 도메인 모델 (Domain Model)
 *
 * @description
 * TypeORM 엔티티(NotificationScheduleEntity)와는 별개로 순수 비즈니스 로직(Service 레이어)과
 * 외부 포트(Provider 인터페이스)에서 데이터를 주고받을 때 사용하는 순수 타입 정의입니다.
 * * 데이터베이스 인프라(DB) 계층의 구현체에 종속되지 않는 순수 객체를 유지함으로써, 
 * 향후 ORM 프레임워크가 변경되거나 Mock 객체를 활용한 단위 테스트 코드를 작성할 때 
 * 결합도를 낮추고 유연성을 확보하기 위한 아키텍처 관점의 분리(Separation of Concerns)입니다.
 */
export type NotificationSchedule = {
  id: number;
  userId: number;
  phone?: string;
  templateCode: NotificationTemplateCode;
  
  /**
   * 템플릿 치환용 동적 변수 맵
   * @description 
   * Record<string, string>을 사용하여 템플릿마다 요구하는 변수 키값(userName, link, point 등)이 
   * 다르더라도 스키마 변경 없이 유연하게 데이터를 주입할 수 있도록 설계했습니다.
   */
  variables: Record<string, string>;
  intervalDays?: number;
  scheduledAt: Date;
  status: NotificationStatus;
  attemptCount: number;
  lastError?: string;
  sentAt?: Date;
  createdAt: Date;
};