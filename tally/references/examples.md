# Tally API Examples

## Complete Registration Form

```json
{
  "title": "Event Registration",
  "description": "Register for our upcoming event",
  "fields": [
    {
      "name": "Full Name",
      "type": "text",
      "required": true,
      "placeholder": "Your name"
    },
    {
      "name": "Email",
      "type": "email",
      "required": true,
      "placeholder": "you@example.com"
    },
    {
      "name": "Company",
      "type": "text",
      "required": false,
      "placeholder": "Your company"
    },
    {
      "name": "Role",
      "type": "dropdown",
      "required": true,
      "options": [
        "Developer",
        "Designer",
        "Product Manager",
        "Other"
      ]
    },
    {
      "name": "Experience Level",
      "type": "multiple_choice",
      "required": true,
      "options": [
        "Beginner",
        "Intermediate",
        "Advanced",
        "Expert"
      ]
    },
    {
      "name": "Topics of Interest",
      "type": "checkboxes",
      "required": false,
      "options": [
        "Frontend Development",
        "Backend Development",
        "DevOps",
        "AI/ML",
        "Blockchain"
      ]
    },
    {
      "name": "Additional Comments",
      "type": "textarea",
      "required": false,
      "placeholder": "Any questions or comments?"
    }
  ]
}
```

## Simple Contact Form

```bash
python3 scripts/tally.py forms create-simple \
  --title "Contact Us" \
  --fields "Name:text:required,Email:email:required,Subject:text:required,Message:textarea:required"
```

## Feedback Survey

```json
{
  "title": "Product Feedback",
  "description": "Help us improve by sharing your thoughts",
  "fields": [
    {
      "name": "How satisfied are you with our product?",
      "type": "multiple_choice",
      "required": true,
      "options": [
        "Very Satisfied",
        "Satisfied",
        "Neutral",
        "Dissatisfied",
        "Very Dissatisfied"
      ]
    },
    {
      "name": "Which features do you use most?",
      "type": "checkboxes",
      "required": false,
      "options": [
        "Dashboard",
        "Reports",
        "Integrations",
        "API",
        "Mobile App"
      ]
    },
    {
      "name": "What could we improve?",
      "type": "textarea",
      "required": false
    },
    {
      "name": "Would you recommend us?",
      "type": "multiple_choice",
      "required": true,
      "options": [
        "Definitely",
        "Probably",
        "Not sure",
        "Probably not",
        "Definitely not"
      ]
    }
  ]
}
```

## Processing Submissions

### Export to CSV

```python
import json
import csv
import subprocess

# Get submissions
result = subprocess.run(
    ["python3", "scripts/tally.py", "submissions", "list", "FORM_ID"],
    capture_output=True, text=True, env={"TALLY_API_KEY": "..."}
)
data = json.loads(result.stdout)

# Write to CSV
with open("submissions.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=data["questions"])
    writer.writeheader()
    for sub in data["submissions"]:
        row = {q["key"]: q.get("value", "") for q in sub["fields"]}
        writer.writerow(row)
```

### Filter by status

```bash
# Only completed submissions
python3 scripts/tally.py submissions list FORM_ID --status FINISHED

# In-progress submissions
python3 scripts/tally.py submissions list FORM_ID --status IN_PROGRESS
```

## API Response Formats

### Form Object

```json
{
  "id": "abc123",
  "name": "My Form",
  "status": "PUBLISHED",
  "workspaceId": "ws123",
  "organizationId": "org123",
  "numberOfSubmissions": 42,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-15T12:00:00.000Z",
  "blocks": [...]
}
```

### Submissions Response

```json
{
  "page": 1,
  "limit": 50,
  "hasMore": false,
  "totalNumberOfSubmissionsPerFilter": {
    "total": 42,
    "finished": 40,
    "inProgress": 2
  },
  "questions": ["Name", "Email", "Message"],
  "submissions": [
    {
      "id": "sub123",
      "createdAt": "2026-01-10T09:00:00.000Z",
      "fields": [
        {"key": "Name", "value": "John Doe"},
        {"key": "Email", "value": "john@example.com"},
        {"key": "Message", "value": "Hello!"}
      ]
    }
  ]
}
```

## Block Types Reference

When working with raw API blocks:

| Block Type | Group Type | Description |
|------------|------------|-------------|
| `FORM_TITLE` | `TEXT` | Form title |
| `TEXT` | `TEXT` | Description text |
| `HEADING_1` | `HEADING_1` | Large heading |
| `HEADING_2` | `HEADING_2` | Medium heading |
| `TITLE` | `QUESTION` | Question label |
| `INPUT_TEXT` | `INPUT_TEXT` | Text field |
| `INPUT_EMAIL` | `INPUT_EMAIL` | Email field |
| `TEXTAREA` | `TEXTAREA` | Multi-line text |
| `INPUT_NUMBER` | `INPUT_NUMBER` | Number field |
| `INPUT_DATE` | `INPUT_DATE` | Date picker |
| `DROPDOWN_OPTION` | `DROPDOWN` | Dropdown option |
| `CHECKBOX` | `CHECKBOXES` | Checkbox option |
| `MULTIPLE_CHOICE_OPTION` | `MULTIPLE_CHOICE` | Radio option |
| `PAGE_BREAK` | `PAGE_BREAK` | Multi-page separator |
