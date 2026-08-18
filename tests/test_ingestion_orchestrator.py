import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.services.orchestrator import IngestionOrchestrator
from app.adapters.sandbox import SandboxAdapter
from app.models.domain import JobCreate
from app.core.exceptions import TransientError
from datetime import datetime, timezone

@pytest.fixture
def mock_db_session():
    return AsyncMock()

@pytest.fixture
def sandbox_adapter():
    adapter = SandboxAdapter()
    return adapter

@pytest.mark.asyncio
async def test_orchestrator_successful_ingestion(mock_db_session):
    with patch('app.adapters.sandbox.SandboxAdapter.fetch_jobs', new_callable=AsyncMock) as mock_fetch:
        mock_fetch.return_value = [{"id": "1", "title": "Test"}]
        
        with patch('app.services.orchestrator.SourceRepository') as MockSourceRepo, \
             patch('app.services.orchestrator.JobRepository') as MockJobRepo, \
             patch('app.services.orchestrator.RunRepository') as MockRunRepo, \
             patch('app.services.orchestrator.Deduplicator') as MockDedup, \
             patch('app.services.orchestrator.BatchValidator.validate_batch') as mock_validate:
             
            mock_source_repo_instance = MockSourceRepo.return_value
            from app.models.database import Source
            import uuid
            mock_source_repo_instance.get_by_name = AsyncMock(return_value=Source(id=uuid.uuid4(), name="sandbox", enabled=True, adapter_type="sandbox"))
            mock_source_repo_instance.record_success = AsyncMock()
            
            mock_run_repo_instance = MockRunRepo.return_value
            mock_run_repo_instance.complete_run = AsyncMock()
            
            mock_job_repo_instance = MockJobRepo.return_value
            mock_job_repo_instance.bulk_update_last_seen = AsyncMock()
            
            mock_validate.return_value = [
                JobCreate(
                    title="Test", company="Co", location="Remote",
                    url="http", description="desc", posted_at=datetime.now(timezone.utc),
                    source="sandbox", source_job_id="1"
                )
            ]
            
            mock_dedup_instance = MockDedup.return_value
            mock_dedup_instance.filter_new_and_updated = AsyncMock(return_value=(mock_validate.return_value, []))
            
            orchestrator = IngestionOrchestrator(mock_db_session)
            metrics = await orchestrator.run_ingestion("sandbox")
            
            assert metrics["status"] == "success"
            assert metrics["metrics"]["fetched"] == 1
            assert metrics["metrics"]["valid"] == 1
            assert metrics["metrics"]["new"] == 1
