---
name: tally
description: Create, manage, and query Tally forms and submissions via API. Use when building registration forms, surveys, contact forms, or any data collection that needs programmatic control. Supports simple text fields, dropdowns, checkboxes, and file uploads.
---

# Tally Forms API

Manage Tally forms programmatically — create forms, list submissions, update fields.

## Setup

Set `TALLY_API_KEY` environment variable or configure in clawdbot:

```json
{
  "skills": {
    "tally": {
      "env": {
        "TALLY_API_KEY": "tly-your-api-key"
      }
    }
  }
}
```

Get your API key at: https://tally.so/settings/api

## Quick Start

### List forms
```bash
python3 {baseDir}/scripts/tally.py forms list
```

### Create simple form
```bash
python3 {baseDir}/scripts/tally.py forms create-simple \
  --title "Contact Form" \
  --fields "Name:text:required,Email:email:required,Message:textarea:optional"
```

### Create form from JSON config
```bash
python3 {baseDir}/scripts/tally.py forms create config.json
```

### Get form details
```bash
python3 {baseDir}/scripts/tally.py forms get <form_id>
```

### List submissions
```bash
python3 {baseDir}/scripts/tally.py submissions list <form_id>
```

## JSON Config Format

For complex forms with dropdowns and checkboxes, use JSON config:

```json
{
  "title": "Registration Form",
  "description": "Optional description text",
  "fields": [
    {"name": "Name", "type": "text", "required": true},
    {"name": "Email", "type": "email", "required": true},
    {"name": "Country", "type": "dropdown", "required": true,
     "options": ["Argentina", "Chile", "Uruguay"]},
    {"name": "Interests", "type": "checkboxes", "required": false,
     "options": ["Bitcoin", "Lightning", "Nostr"]},
    {"name": "Comments", "type": "textarea", "required": false}
  ]
}
```

### Field Types

| Type | Description |
|------|-------------|
| `text` | Single line text input |
| `email` | Email input with validation |
| `textarea` | Multi-line text |
| `number` | Numeric input |
| `date` | Date picker |
| `phone` | Phone number |
| `link` | URL input |
| `dropdown` | Single select from options |
| `checkboxes` | Multiple select from options |
| `multiple_choice` | Radio buttons (single select) |

## Commands Reference

### Forms

```bash
# List all forms
python3 {baseDir}/scripts/tally.py forms list [--limit N]

# Get single form
python3 {baseDir}/scripts/tally.py forms get <form_id>

# Create from JSON
python3 {baseDir}/scripts/tally.py forms create <config.json>

# Create simple form
python3 {baseDir}/scripts/tally.py forms create-simple --title "Title" --fields "spec"

# Update form
python3 {baseDir}/scripts/tally.py forms update <form_id> <updates.json>

# Delete form
python3 {baseDir}/scripts/tally.py forms delete <form_id>
```

### Submissions

```bash
# List submissions
python3 {baseDir}/scripts/tally.py submissions list <form_id> [--limit N] [--status IN_PROGRESS|FINISHED]

# Get single submission
python3 {baseDir}/scripts/tally.py submissions get <form_id> <submission_id>

# Delete submission
python3 {baseDir}/scripts/tally.py submissions delete <form_id> <submission_id>
```

## Embedding Forms

After creating a form, embed it in your site:

```html
<!-- Modal trigger -->
<button data-tally-open="FORM_ID" data-tally-layout="modal">
  Open Form
</button>

<!-- Inline embed -->
<iframe 
  src="https://tally.so/embed/FORM_ID?alignLeft=1&hideTitle=1" 
  width="100%" 
  height="500" 
  frameborder="0">
</iframe>

<!-- Include Tally script -->
<script src="https://tally.so/widgets/embed.js"></script>
```

## API Rate Limits

- 100 requests per minute
- API is in public beta (free for all users)

## Common Patterns

### Registration form with dropdowns
See `references/examples.md` for complete examples.

### Webhook integration
Forms can trigger webhooks on submission. Configure via Tally dashboard or API.
