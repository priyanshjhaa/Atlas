import { Injectable, NotFoundException } from "@nestjs/common";
import type { GraphTraversalQueryDto } from "./dto/graph-traversal-query.dto";
import { GraphTraversalService } from "./graph-traversal.service";
import { IntelligenceRepository } from "./intelligence.repository";
import { RetrievalService } from "./retrieval.service";

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly repository: IntelligenceRepository,
    private readonly retrieval: RetrievalService,
    private readonly graphTraversal: GraphTraversalService,
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

  async graph(
    workspaceId: string,
    repositoryId: string,
    query: GraphTraversalQueryDto,
  ) {
    if (!(await this.repository.repositoryExists(workspaceId, repositoryId))) {
      throw new NotFoundException("Repository not found.");
    }
    return this.graphTraversal.traverse(workspaceId, repositoryId, {
      entityId: query.entityId,
      depth: query.depth,
      direction: query.direction,
      includeHistorical: query.includeHistorical,
      includeInferred: query.includeInferred,
    });
  }

  search(workspaceId: string, repositoryId: string, query: string) {
    return this.retrieval.search(workspaceId, repositoryId, query.trim());
  }
}
