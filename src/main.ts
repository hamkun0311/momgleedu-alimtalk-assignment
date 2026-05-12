import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * 애플리케이션 진입점 (Entry Point)
 *
 * @description
 * NestJS 애플리케이션의 인스턴스를 생성하고, 전역 미들웨어, 파이프, 인터셉터 등을 설정한 뒤
 * HTTP 서버를 구동(Bootstrap)하는 최상위 실행 파일입니다.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /**
   * CORS (Cross-Origin Resource Sharing) 정책 설정
   *
   * @todo [운영 환경 보안 취약점]
   * 현재 app.enableCors()가 옵션 없이 호출되어 모든 출처(Origin)에서의 접근을 허용(Wildcard)하고 있습니다.
   * 로컬 개발 단계에서는 편하지만, 프로덕션(Production) 배포 시에는 CSRF 등의 프론트엔드 탈취 공격을 방지하기 위해
   * 반드시 서비스 중인 특정 프론트엔드 도메인만 허용하도록 origin 화이트리스트를 명시해야 합니다.
   */
  app.enableCors();

  /**
   * [Critical] 전역 유효성 검사 파이프 (Global Validation Pipe) 누락
   *
   * @description
   * 상단에 ValidationPipe가 import 되어 있으나, 인스턴스에 적용하는 코드가 누락되어 있습니다.
   * 이 상태라면 AuthController에서 꼼꼼하게 설정한 RegisterDto의 @IsEmail(), @IsString() 검증이 전혀 동작하지 않습니다.
   * 실무에서는 아래와 같이 전역 파이프를 반드시 등록하여 애플리케이션 레벨의 방어막을 쳐야 합니다.
   *
   * // 코드를 아래와 같이 추가해야 합니다.
   * app.useGlobalPipes(
   * new ValidationPipe({
   * whitelist: true, // DTO에 정의되지 않은 속성은 네트워크 단에서 자동 제거 (보안)
   * forbidNonWhitelisted: true, // 의도치 않은 속성이 들어오면 즉시 400 Bad Request 반환
   * transform: true, // 네트워크를 통해 넘어온 순수 JSON을 클래스 인스턴스로 자동 형변환
   * })
   * );
   */

  /**
   * 우아한 종료 (Graceful Shutdown) 고려
   *
   * @description
   * 현재 과제 스펙에는 없으나, 실무의 클라우드(Kubernetes, Docker) 환경에서는 
   * 컨테이너가 배포나 스케일링으로 인해 종료(SIGTERM)될 때, 
   * 처리 중이던 HTTP 요청을 완료하고 DB 커넥션을 안전하게 끊어주는 
   * app.enableShutdownHooks(); 설정이 필수적으로 요구됩니다.
   */

  // 인프라 환경(PaaS, 컨테이너 등)에서 주입해 주는 포트를 우선적으로 사용하여 포트 충돌을 방지합니다.
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();