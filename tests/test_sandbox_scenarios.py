import pytest
import httpx
from unittest.mock import patch
from app.adapters.sandbox import SandboxAdapter
from app.core.exceptions import TransientError, ParseError

@pytest.mark.asyncio
async def test_sandbox_adapter_success_normalization():
    adapter = SandboxAdapter()
    
    mock_data = {
        "id": "sandbox-1",
        "title": "Software Engineer",
        "company_name": "Test Co",
        "url": "http://test.com"
    }
    
    normalized = adapter._normalize(mock_data)
    assert normalized.title == "Software Engineer"
    assert normalized.company == "Test Co"
    assert normalized.source == "sandbox"

@pytest.mark.asyncio
async def test_sandbox_adapter_schema_failure():
    adapter = SandboxAdapter()
    
    mock_data = {
        "id": "sandbox-1",
        "company_name": "Test Co",
    }
    
    from pydantic import ValidationError
    with pytest.raises(ValidationError) as exc_info:
        adapter._normalize(mock_data)
        
    assert "title" in str(exc_info.value)
