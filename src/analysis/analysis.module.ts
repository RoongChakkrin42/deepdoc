import { Module } from '@nestjs/common';
import { AnalysisService } from './analysis.service';

/**
 * Deliberately has no database or storage dependency: it turns PDFs into a
 * score and nothing else. The submission lifecycle (status, retries,
 * persistence) lives in `SubmissionsService`, which keeps this module free of
 * a circular dependency and trivially testable with buffers.
 */
@Module({
  providers: [AnalysisService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
