import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { UserEntity } from './users/user.entity';
import { NotificationScheduleEntity } from './notifications/notification-schedule.entity';

import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { UsersRepository } from './users/users.repository';
import { NotificationAdminController } from './admin/notification-admin.controller';
import { NotificationService } from './notifications/notification.service';
import { NotificationRepository } from './notifications/notification.repository';
import { MockAlimtalkProvider } from './notifications/alimtalk.provider';
import { NotificationCron } from './notifications/notification.cron';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * 애플리케이션 루트 모듈 (Root Module)
 *
 * @description
 * NestJS 애플리케이션의 진입점이자 모든 의존성 트리(Dependency Tree)가 묶이는 최상위 모듈입니다.
 * 현재는 빠른 기능 구현을 위해 단일 모듈(Monolith) 구조를 취하고 있으나, 향후 시스템이 확장되면 
 * Domain-Driven Design(DDD) 관점에 따라 AuthModule, UserModule, NotificationModule 등 
 * 기능별로 서브 모듈을 분리하여 도메인 간의 결합도를 낮추는 리팩토링이 권장됩니다.
 */
@Module({
  imports: [
    /**
     * 환경변수 관리 모듈 (.env)
     * @description isGlobal: true 옵션을 주어 하위 모듈이나 서비스에서 ConfigModule을 
     * 매번 반복적으로 import 하지 않도록 개발 편의성을 높였습니다.
     */
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    
    /**
     * 배치 스케줄러 모듈
     * @description 애플리케이션 컨텍스트 내에서 @Cron 데코레이터가 백그라운드 워커로 동작할 수 있도록 활성화합니다.
     */
    ScheduleModule.forRoot(),
    
    /**
     * 데이터베이스 커넥션 설정 (비동기)
     * @description
     * DB 주소 및 자격 증명(Credential)과 같은 민감한 인프라 정보를 소스코드에 하드코딩하지 않고,
     * 애플리케이션이 런타임에 실행될 때 ConfigService를 통해 동적으로 주입받도록 구성했습니다(forRootAsync).
     * 이를 통해 로컬, 개발, 운영 등 각 배포 환경(Environment)에 맞는 DB를 안전하게 연결할 수 있습니다.
     */
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        url: configService.get<string>('DATABASE_URL'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        
        /**
         * [치명적 위험: 프로덕션 배포 시 주의]
         * @description
         * synchronize: true는 엔티티 클래스의 변경 사항을 감지하여 DB 스키마를 자동으로 수정(DROP & CREATE 등)합니다.
         * 로컬 개발 단계에서는 매우 편리하지만, 운영(Production) DB에 연결된 상태로 이 옵션이 켜져 있으면
         * 기존 테이블이 삭제되고 데이터가 모두 날아가는 치명적인 대형 장애를 유발할 수 있습니다.
         * 실무에서는 반드시 false로 설정하고, TypeORM Migration 스크립트를 작성하여 스키마 형상을 안전하게 관리해야 합니다.
         */
        synchronize: true, 
        logging: true,
      }),
    }),
    TypeOrmModule.forFeature([UserEntity, NotificationScheduleEntity]),
  ],
  controllers: [
    AuthController, 
    NotificationAdminController
  ],
  providers: [
    AuthService,
    UsersRepository,
    NotificationService,
    NotificationRepository,
    
    /**
     * [DI 및 OCP 원칙 적용 구조화]
     * @description
     * 현재는 구체 클래스(MockAlimtalkProvider)를 배열에 직접 나열하여 주입하고 있습니다.
     * 앞서 설계한 추상화 인터페이스(AlimtalkProvider)의 이점을 완벽히 살리기 위해서는, 향후 이 부분을 
     * { provide: 'AlimtalkProvider', useClass: MockAlimtalkProvider } 형태로 변경하여
     * 의존성 역전(DIP)을 애플리케이션 컨텍스트 단위에서 명시적으로 선언해 주는 것이 좋습니다.
     */
    MockAlimtalkProvider,
    NotificationCron
  ],
})
export class AppModule {}