import { Body, Controller, Post, Delete, Param } from '@nestjs/common';
import { RegisterDto } from './register.dto';
import { AuthService } from './auth.service';

/**
 * 인증 및 계정 라이프사이클 관리 컨트롤러
 * * @description
 * 회원가입 및 계정 탈퇴와 같은 유저의 핵심 상태 변화를 처리하는 엔드포인트입니다.
 * 외부 노출 API이므로 악의적인 대량 가입(Spam)이나 무차별 대입 공격(Brute-force)을 방지하기 위해
 * 향후 Throttler(Rate Limiting) 적용이 권장됩니다.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 신규 유저 회원가입
   * * @description
   * 클라이언트로부터 전달받은 페이로드를 RegisterDto를 통해 검증(Validation)한 후 서비스 레이어로 위임합니다.
   * 유저 생성과 동시에 알림톡 스케줄링 등 후속 트랜잭션 처리가 수반됩니다.
   */
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  /**
   * 회원 탈퇴 (Soft Delete)
   * * @description
   * 현재 과제 스펙상 이메일을 Path Variable로 전달받아 탈퇴 처리를 진행하고 있으나,
   * 이는 타인의 이메일을 무단으로 탈퇴시킬 수 있는 보안 취약점이 존재합니다.
   * * @todo 실무 환경에서는 클라이언트에서 직접 식별자를 받지 않고,
   * 헤더의 JWT(Access Token)를 검증한 후 AuthGuard를 통과한 요청에서만 추출된 User ID 기반으로
   * 탈퇴가 이루어지도록 리팩토링이 필수적입니다.
   */
  @Delete('withdraw/:email')
  withdraw(@Param('email') email: string) {
    return this.authService.withdraw(email);
  }
}