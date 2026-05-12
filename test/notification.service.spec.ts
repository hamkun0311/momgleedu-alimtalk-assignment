import { NotificationService } from '../src/notifications/notification.service'
import { MockAlimtalkProvider } from '../src/notifications/alimtalk.provider'

/**
 * NotificationService 핵심 비즈니스 로직 단위 테스트 (Unit Test)
 *
 * @description
 * 데이터베이스나 외부 API(카카오톡) 같은 무거운 인프라에 의존하지 않고, 
 * 서비스 레이어의 순수 도메인 로직이 기획된 정책대로 동작하는지 검증(Verify)합니다.
 * 이를 통해 CI/CD 파이프라인에서 수천 개의 테스트를 수 초 내에 수행할 수 있는 빠른 피드백 루프를 구축합니다.
 */
describe('NotificationService', () => {
  let service: NotificationService;
  
  // 외부 의존성을 대체할 Test Doubles (Mock & Fake)
  let mockNotificationRepo: any;
  let mockUsersRepo: any;

  /**
   * 테스트 격리 (Test Isolation) 및 초기화
   * @description 각 테스트 케이스(it)가 실행되기 전마다 독립적인 환경을 구성하여 
   * 테스트 간의 상태 오염(State Pollution)으로 인한 Flaky Test(간헐적 실패)를 방지합니다.
   */
  beforeEach(() => {
    /**
     * [Fake Repository 패턴 적용]
     * 단순한 Mocking(jest.fn)을 넘어, 메모리 상의 배열(schedules)을 활용해 
     * 실제 DB처럼 상태를 저장하고 반환하는 Fake 객체를 구현했습니다.
     * 이를 통해 서비스 로직 실행 후의 '최종 상태(State)'를 단언(Assert)하기 용이해집니다.
     */
    mockNotificationRepo = {
      schedules: [],
      create: jest.fn().mockImplementation((input) => {
        const newSchedule = { ...input, id: Date.now() };
        mockNotificationRepo.schedules.push(newSchedule);
        return newSchedule;
      }),
      findAll: jest.fn().mockImplementation(() => mockNotificationRepo.schedules),
    };

    mockUsersRepo = {
      findById: jest.fn(),
    };

    /**
     * [환경변수 제어]
     * 테스트 환경에서는 .env 파일이 없거나 다를 수 있으므로, ConfigService를 모킹하여 
     * 언제, 어디서 테스트를 실행하든 항상 동일한 설정값(결정론적 결과)을 보장하도록 만듭니다.
     */
    const mockConfigService = {
      get: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
    };

    /**
     * 의존성 주입 (Dependency Injection)
     * @description NestJS의 테스트 모듈(Test.createTestingModule)을 사용하지 않고 직접 인스턴스화했습니다.
     * 프레임워크의 부트스트랩 오버헤드를 제거하여 테스트 실행 속도를 극대화하기 위한 실무적인 접근입니다.
     */
    service = new NotificationService(
      mockNotificationRepo,
      mockUsersRepo,
      new MockAlimtalkProvider(mockConfigService as any),
      mockConfigService as any
    );
  });

  /**
   * Happy Path (정상 흐름) 정책 검증
   * @description 
   * 가입 시점(Base Time)을 기준으로 4개의 스텝(즉시, D+3, D+6, D+14)이 
   * 누락 없이, 올바른 순서로, '발송 대기(pending)' 상태로 생성되는지 확인합니다.
   */
  it('전화번호가 있고 수신 동의한 유저는 pending 상태로 4개의 알림이 예약된다.', async () => {
    const result = await service.scheduleOnboardingMessages({
      id: 1,
      name: '테스트맘',
      email: 'test@example.com',
      phone: '01012345678',
      agreeMarketingReceiveSms: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z')
    } as any);

    expect(result).toHaveLength(4);
    
    // 비즈니스 정책(Policy)과 코드가 일치하는지 템플릿의 배열 상태를 검증합니다.
    expect(mockNotificationRepo.findAll().map((row:any) => row.templateCode)).toEqual([
      'ONBOARDING_WELCOME',
      'ONBOARDING_D3',
      'ONBOARDING_D6',
      'ONBOARDING_D14'
    ]);

    // 모든 발송건이 정상적으로 큐(Queue)에서 대기 중인지 검증합니다.
    expect(mockNotificationRepo.findAll().every((row:any) => row.status === 'pending')).toBeTruthy();
  });

  /**
   * Edge Case (예외 흐름) 및 감사(Audit) 요건 검증
   * @description 
   * [설계 철학 입증] 수신 거부 유저에게 발송하지 않는 것은 당연하지만, 
   * '왜 발송하지 않았는지'에 대한 근거 레코드가 DB에 남는지(Audit Trail)를 중점적으로 검증합니다.
   * 이는 향후 법적 분쟁이나 CS 인입 시 시스템의 무결성을 증명하는 매우 중요한 테스트입니다.
   */
  it('수신 동의를 하지 않은 유저는 생성은 되지만 skipped 상태로 예약된다.', async () => {
    await service.scheduleOnboardingMessages({
      id: 2,
      name: '테스트맘2',
      email: 'test2@example.com',
      phone: '01012345678',
      agreeMarketingReceiveSms: false, // 통신망법에 따른 수신 거부(Opt-out) 상태
      createdAt: new Date()
    } as any);

    const schedules = mockNotificationRepo.findAll();
    
    // 생성(Create) 로직 자체는 스킵되지 않고 정상적으로 4개의 레코드를 만듭니다.
    expect(schedules).toHaveLength(4);
    
    // 하지만 상태 머신(State Machine)에 의해 모든 레코드가 '취소(skipped)' 상태로 강제 전환되어, 
    // 향후 스케줄러(Cron)가 이를 풀링하지 않음을 보장합니다.
    expect(schedules.every((row:any) => row.status === 'skipped')).toBeTruthy();
  });
});