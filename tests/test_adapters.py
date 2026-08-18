"""
Tests for source adapters.
"""
import pytest
from app.adapters.remotive import RemotiveAdapter
from app.adapters.hn_hiring import HNHiringAdapter


@pytest.mark.asyncio
async def test_remotive_salary_parser():
    adapter = RemotiveAdapter()
    
    min_sal, max_sal, curr = adapter._parse_salary("$60k - $80k")
    assert min_sal == 60000.0
    assert max_sal == 80000.0
    assert curr == "USD"
    
    min_sal, max_sal, curr = adapter._parse_salary("€40,000-50,000")
    assert min_sal == 40000.0
    assert max_sal == 50000.0
    assert curr == "EUR"
    
    min_sal, max_sal, curr = adapter._parse_salary("Competitive")
    assert min_sal is None


@pytest.mark.asyncio
async def test_hn_comment_parser():
    adapter = HNHiringAdapter()
    
    comment = {
        "id": "123",
        "text": "Stripe | Software Engineer | Remote | $150k<br><br>We are looking for great engineers.",
        "created_at_i": 1690000000,
    }
    
    job = adapter._parse_comment(comment)
    assert job is not None
    assert job.company == "Stripe"
    assert job.title == "Software Engineer"
    assert job.location == "Remote"
    assert job.remote is True
    assert "looking for great engineers" in job.description
