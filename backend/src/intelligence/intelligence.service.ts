import { Injectable, NotFoundException } from "@nestjs/common";
import { IntelligenceRepository } from "./intelligence.repository";
import { RetrievalService } from "./retrieval.service";

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly repository: IntelligenceRepository,
    private readonly retrieval: RetrievalService,
  ) {}

  async architecture(workspaceId: string, repositoryId: string) {
    if (!(await this.repository.repositoryExists(workspaceId, repositoryId))) {
      throw new NotFoundException("Repository not found.");
    }
    const snapshot = await this.repository.architecture(
      workspaceId,
      repositoryId,
    );
    if (!snapshot) {
      throw new NotFoundException(
        "No architecture snapshot exists. Synchronize the repository first.",
      );
    }
    return snapshot;
  }

  search(workspaceId: string, repositoryId: string, query: string) {
    return this.retrieval.search(workspaceId, repositoryId, query.trim());
  }
}
