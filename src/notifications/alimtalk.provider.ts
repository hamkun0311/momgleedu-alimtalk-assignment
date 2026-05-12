import { Injectable, Logger } from '@nestjs/common';
import { NotificationTemplateCode } from './notification.model';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';

export type SendAlimtalkInput = {
  phone: string;
  templateCode: NotificationTemplateCode;
  variables: Record<string, string>;
};

/**
 * 알림톡 발송 프로바이더 인터페이스 (Port)
 *
 * @description
 * 비즈니스 로직과 외부 인프라(카카오 API 등) 간의 결합도를 낮추기 위한 추상화 레이어입니다.
 * 객체 지향의 의존성 역전 원칙(DIP)과 개방-폐쇄 원칙(OCP)을 준수하여,
 * 향후 운영 환경에서 벤더사(NHN Cloud, Infobank 등)가 변경되더라도 
 * 핵심 서비스 로직의 수정 없이 구현체(Adapter)만 갈아 끼울 수 있도록 설계되었습니다.
 */
export interface AlimtalkProvider {
  send(input: SendAlimtalkInput): Promise<{ providerMessageId: string }>;
}

/**
 * 카카오톡 '나에게 보내기' API를 활용한 개발/시연용 구현체 (Adapter)
 *
 * @description
 * 실제 비즈니스 채널 연동 전, 메시지 조립 및 네트워크 발송 흐름을 검증하기 위한 모의(Mock) 클래스입니다.
 * 프로덕션(Production) 배포 시에는 이 클래스 대신 실제 비즈메시지 API를 호출하는 
 * RealAlimtalkProvider 로 교체하여 의존성을 주입해야 합니다.
 */
@Injectable()
export class MockAlimtalkProvider implements AlimtalkProvider {
  private readonly logger = new Logger(MockAlimtalkProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async send(input: SendAlimtalkInput): Promise<{ providerMessageId: string }> {
    if (!input.phone) throw new Error('missing_phone');

    // 시크릿 키 하드코딩 방지: 환경변수(.env)에서 런타임에 동적으로 토큰을 주입받아 보안성을 확보합니다.
    const KAKAO_ACCESS_TOKEN = this.configService.get<string>('KAKAO_ACCESS_TOKEN');

    /**
     * [설계 의도: 템플릿 로직과 데이터의 완전한 분리]
     * DB에는 완성된 문장이 아닌 '템플릿 코드'와 '치환용 변수(JSON)'만 영속화되어 있습니다.
     * 발송 1밀리초 직전에 이곳에서 최종 텍스트로 조립(Hydration)됩니다.
     * 이 구조 덕분에 마케팅 부서의 요청으로 알림톡 멘트가 수시로 변경되더라도,
     * 대기 중인 수만 건의 DB 레코드를 마이그레이션(UPDATE)할 필요 없이 코드만 배포하면 즉시 반영됩니다.
     */
    let text = '';
    switch(input.templateCode) {
      case 'ONBOARDING_WELCOME':
        text = `[가입 환영] ${input.variables.userName}님, 서비스 구독을 환영합니다!\n\n이용 가이드를 확인해보세요.\n${input.variables.guideLink}`;
        break;
      case 'ONBOARDING_D3':
        text = `[가입 3분 경과] ${input.variables.userName}님, 우리 아이의 학습 상태는 어떤가요? 3일차 추천 학습 루틴입니다`;
        break;
      case 'ONBOARDING_D6': // 7분 알림용
        text = `[가입 7분 경과] ${input.variables.userName}님, 우리 아이의 학습 상태는 어떤가요? 7일차 추천 학습 루틴입니다`;
        break;
      case 'ONBOARDING_D14':
        text = `[가입 14분 경과] ${input.variables.userName}님, 우리 아이의 학습 상태는 어떤가요? 14일차 추천 학습 루틴입니다`;
        break;
    }

    const templateObject = {
      object_type: "text",
      text: text,
      link: {
        web_url: "http://localhost:8080", // 카카오 디벨로퍼스에 등록된 도메인과 반드시 일치해야 CORS/보안 정책을 통과합니다.
        mobile_web_url: "http://localhost:8080"
      },
      button_title: "확인하기"
    };

    try {
      /**
       * 외부 API 통신 (HTTP POST)
       * @todo 실무 환경에서는 외부 API 장애가 우리 서버의 장애(Thread Hang)로 전파되지 않도록,
       * axios 호출 시 timeout(예: 3000ms) 설정을 필수로 추가하여 빠른 실패(Fail-fast)를 유도해야 합니다.
       */
      await axios.post(
        'https://kapi.kakao.com/v2/api/talk/memo/default/send',
        `template_object=${encodeURIComponent(JSON.stringify(templateObject))}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Bearer ${KAKAO_ACCESS_TOKEN}`
          }
        }
      );
      
      this.logger.log(`[KAKAO_SENT_SUCCESS] Template: ${input.templateCode}`);
      return { providerMessageId: `kakao_${Date.now()}` };
      
    } catch (error) {
      /**
       * [장애 격리 및 재시도 유도]
       * 외부 통신 실패(네트워크 단절, 토큰 만료 등) 시 에러를 삼키지(Swallow) 않고 명시적으로 로깅합니다.
       * 이후 규격화된 에러를 던져(Throw), 상위 비즈니스 로직(NotificationService)이 
       * 이를 캐치하고 재시도(Retry Count 증가) 큐에 안전하게 넣을 수 있도록 책임을 위임합니다.
       */
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[KAKAO_SENT_FAILED] Template: ${input.templateCode} - ${errorMessage}`);
      throw new Error('kakao_api_request_failed');
    }
  }
}