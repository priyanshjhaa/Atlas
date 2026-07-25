import { Global, Module } from "@nestjs/common";
import { DatabaseService } from "./database.service";
import { RepositoriesRepository } from "./repositories.repository";

@Global()
@Module({
  providers: [DatabaseService, RepositoriesRepository],
  exports: [DatabaseService, RepositoriesRepository],
})
export class DatabaseModule {}
