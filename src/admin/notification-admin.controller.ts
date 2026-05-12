import { Controller, Get, Post } from '@nestjs/common';
import { NotificationService } from '../notifications/notification.service';

/**
 * 알림 스케줄링 관리자용 컨트롤러
 *
 * @description
 * 시스템 내부의 알림 예약 현황 모니터링 및 수동 조작을 위한 어드민 전용 API입니다.
 * 향후 운영 환경(Production) 배포 시 IP 화이트리스트 처리나 어드민 권한 검증(Guard) 추가가 반드시 필요합니다.
 */
@Controller('admin/notifications')
export class NotificationAdminController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * 알림 발송 이력 및 예약 현황 전체 조회
   *
   * @todo 현재는 findAll()을 통해 전체 데이터를 메모리에 로드하고 있습니다.
   * 서비스 운영 기간이 길어져 테이블 데이터가 수십만 건 이상으로 누적될 경우,
   * OOM(Out Of Memory) 장애를 유발할 수 있으므로 향후 Cursor 또는 Offset 기반의 Pagination 적용이 필요합니다.
   */
  @Get()
  list() {
    return this.notificationService.findAll();
  }

  /**
   * 대기 중인(pending) 알림 수동 발송 처리
   *
   * @description
   * 백그라운드에서 동작하는 Cron 스케줄러에 장애가 발생했을 때 수동으로 개입하기 위한 Fallback API입니다.
   * 또한, 개발/QA 단계에서 스케줄러 주기를 기다리지 않고 발송 로직을 즉시 검증하고 싶을 때 유용하게 활용됩니다.
   */
  @Post('send-due')
  sendDue() {
    return this.notificationService.sendDueMessages();
  }
}