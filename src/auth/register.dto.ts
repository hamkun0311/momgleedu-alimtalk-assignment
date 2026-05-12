import { IsBoolean, IsEmail, IsOptional, IsString, Matches } from 'class-validator';

/**
 * 신규 회원가입 요청 데이터 검증 객체 (DTO)
 *
 * @description
 * 클라이언트로부터 유입되는 Payload가 서버의 비즈니스 로직에 도달하기 전,
 * 유효성(Validation)과 타입 안전성(Type Safety)을 보장하는 최전방 방어선입니다.
 * NestJS의 ValidationPipe와 결합하여 잘못된 데이터 유입 시 즉시 400 Bad Request를 반환합니다.
 */
export class RegisterDto {
  /**
   * 유저의 실명 또는 닉네임
   * * @todo 현재 단순 문자열 여부만 체크하고 있으나,
   * 실무에서는 길이에 대한 제한(ex: @Length(2, 20))이나 
   * 악의적인 스크립트(XSS) 삽입을 막기 위한 추가적인 필터링 로직이 필요할 수 있습니다.
   */
  @IsString()
  name!: string;

  /**
   * 유저의 고유 식별 이메일
   * * @description RFC 5322 포맷을 따르는 이메일 주소인지 검증합니다.
   */
  @IsEmail()
  email!: string;

  /**
   * 알림톡 수신용 휴대전화 번호 (선택값)
   *
   * @description
   * '01X'로 시작하고 뒤에 8~9자리의 숫자가 오는지 정규표현식(Regex)으로 엄격하게 검증합니다.
   * (-) 하이픈이 없는 숫자로만 구성된 포맷을 강제하여 DB 저장 형식 및 
   * Alimtalk API 호출 규격을 일관되게 유지합니다.
   * * @note @IsOptional()을 통해 번호 제공을 거부한 유저(phone이 undefined)도 가입이 가능하도록 허용합니다.
   */
  @IsOptional()
  @Matches(/^01[0-9]{8,9}$/)
  phone?: string;

  /**
   * 마케팅 및 알림톡 수신 동의 여부
   *
   * @description
   * 이 값이 true이더라도 phone 값이 존재하지 않으면 알림톡은 발송되지 않으며(Skipped 처리),
   * 법적 컴플라이언스(정보통신망법) 준수를 위해 회원가입 시 반드시 명시적인 동의/거부 상태를 수집합니다.
   */
  @IsBoolean()
  agreeMarketingReceiveSms!: boolean;
}