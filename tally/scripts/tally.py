#!/usr/bin/env python3
"""
Tally API CLI - Manage forms and submissions programmatically.

Usage:
    tally.py forms list
    tally.py forms get <form_id>
    tally.py forms create <json_file>
    tally.py forms create-simple --title "Form Title" --fields "name:text:required,email:email:required"
    tally.py forms update <form_id> <json_file>
    tally.py forms delete <form_id>
    tally.py submissions list <form_id>
    tally.py submissions get <form_id> <submission_id>
    tally.py submissions delete <form_id> <submission_id>

Environment:
    TALLY_API_KEY - Your Tally API key (required)
"""

import argparse
import json
import os
import sys
import uuid
from typing import Any, Optional

try:
    import requests
except ImportError:
    print("Error: requests library required. Install with: pip install requests")
    sys.exit(1)

BASE_URL = "https://api.tally.so"


def get_api_key() -> str:
    """Get API key from environment."""
    key = os.environ.get("TALLY_API_KEY")
    if not key:
        print("Error: TALLY_API_KEY environment variable not set")
        sys.exit(1)
    return key


def api_request(
    method: str,
    endpoint: str,
    data: Optional[dict] = None,
    params: Optional[dict] = None
) -> dict:
    """Make API request to Tally."""
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "Authorization": f"Bearer {get_api_key()}",
        "Content-Type": "application/json"
    }
    
    response = requests.request(
        method=method,
        url=url,
        headers=headers,
        json=data,
        params=params
    )
    
    if response.status_code == 204:
        return {"success": True, "message": "Deleted successfully"}
    
    try:
        result = response.json()
    except json.JSONDecodeError:
        result = {"error": response.text, "status_code": response.status_code}
    
    if response.status_code >= 400:
        print(f"Error {response.status_code}: {json.dumps(result, indent=2)}", file=sys.stderr)
        sys.exit(1)
    
    return result


def gen_uuid() -> str:
    """Generate a valid UUID."""
    return str(uuid.uuid4())


def build_simple_form(title: str, fields_spec: str) -> dict:
    """
    Build a form from a simple specification.
    
    Fields spec format: "name:type:required,email:type:optional,..."
    Types: text, email, textarea, number, date, phone, link
    """
    blocks = []
    
    # Form title
    title_group = gen_uuid()
    blocks.append({
        "uuid": gen_uuid(),
        "type": "FORM_TITLE",
        "groupUuid": title_group,
        "groupType": "TEXT",
        "payload": {
            "title": title,
            "safeHTMLSchema": [[title]]
        }
    })
    
    # Parse fields
    type_map = {
        "text": "INPUT_TEXT",
        "email": "INPUT_EMAIL",
        "textarea": "TEXTAREA",
        "number": "INPUT_NUMBER",
        "date": "INPUT_DATE",
        "phone": "INPUT_PHONE_NUMBER",
        "link": "INPUT_LINK"
    }
    
    for field_spec in fields_spec.split(","):
        parts = field_spec.strip().split(":")
        if len(parts) < 2:
            continue
            
        field_name = parts[0].strip()
        field_type = parts[1].strip().lower()
        is_required = len(parts) > 2 and parts[2].strip().lower() == "required"
        
        input_type = type_map.get(field_type, "INPUT_TEXT")
        
        # Question title
        q_group = gen_uuid()
        blocks.append({
            "uuid": gen_uuid(),
            "type": "TITLE",
            "groupUuid": q_group,
            "groupType": "QUESTION",
            "payload": {
                "safeHTMLSchema": [[field_name]]
            }
        })
        
        # Input field
        blocks.append({
            "uuid": gen_uuid(),
            "type": input_type,
            "groupUuid": gen_uuid(),
            "groupType": input_type,
            "payload": {
                "isRequired": is_required,
                "placeholder": ""
            }
        })
    
    return {
        "status": "PUBLISHED",
        "blocks": blocks
    }


def build_form_with_options(config: dict) -> dict:
    """
    Build a form from a config dict with support for dropdowns and checkboxes.
    
    Config format:
    {
        "title": "Form Title",
        "description": "Optional description",
        "fields": [
            {"name": "Name", "type": "text", "required": true},
            {"name": "Email", "type": "email", "required": true},
            {"name": "Country", "type": "dropdown", "required": true, 
             "options": ["Argentina", "Chile", "Uruguay"]},
            {"name": "Interests", "type": "checkboxes", "required": false,
             "options": ["Bitcoin", "Lightning", "Nostr"]}
        ]
    }
    """
    blocks = []
    
    # Form title
    title_group = gen_uuid()
    blocks.append({
        "uuid": gen_uuid(),
        "type": "FORM_TITLE",
        "groupUuid": title_group,
        "groupType": "TEXT",
        "payload": {
            "title": config["title"],
            "safeHTMLSchema": [[config["title"]]]
        }
    })
    
    # Optional description
    if config.get("description"):
        blocks.append({
            "uuid": gen_uuid(),
            "type": "TEXT",
            "groupUuid": gen_uuid(),
            "groupType": "TEXT",
            "payload": {
                "safeHTMLSchema": [[config["description"]]]
            }
        })
    
    # Type mapping
    type_map = {
        "text": "INPUT_TEXT",
        "email": "INPUT_EMAIL",
        "textarea": "TEXTAREA",
        "number": "INPUT_NUMBER",
        "date": "INPUT_DATE",
        "phone": "INPUT_PHONE_NUMBER",
        "link": "INPUT_LINK"
    }
    
    for field in config.get("fields", []):
        field_name = field["name"]
        field_type = field.get("type", "text").lower()
        is_required = field.get("required", False)
        options = field.get("options", [])
        placeholder = field.get("placeholder", "")
        
        # Question title
        q_group = gen_uuid()
        blocks.append({
            "uuid": gen_uuid(),
            "type": "TITLE",
            "groupUuid": q_group,
            "groupType": "QUESTION",
            "payload": {
                "safeHTMLSchema": [[field_name]]
            }
        })
        
        if field_type == "dropdown" and options:
            # Dropdown options
            option_group = gen_uuid()
            for i, opt in enumerate(options):
                blocks.append({
                    "uuid": gen_uuid(),
                    "type": "DROPDOWN_OPTION",
                    "groupUuid": option_group,
                    "groupType": "DROPDOWN",
                    "payload": {
                        "index": i,
                        "isRequired": is_required if i == 0 else False,
                        "isFirst": i == 0,
                        "isLast": i == len(options) - 1,
                        "text": opt
                    }
                })
        elif field_type == "checkboxes" and options:
            # Checkboxes
            checkbox_group = gen_uuid()
            for i, opt in enumerate(options):
                blocks.append({
                    "uuid": gen_uuid(),
                    "type": "CHECKBOX",
                    "groupUuid": checkbox_group,
                    "groupType": "CHECKBOXES",
                    "payload": {
                        "index": i,
                        "isRequired": is_required if i == 0 else False,
                        "isFirst": i == 0,
                        "isLast": i == len(options) - 1,
                        "text": opt
                    }
                })
        elif field_type == "multiple_choice" and options:
            # Multiple choice (radio buttons)
            mc_group = gen_uuid()
            for i, opt in enumerate(options):
                blocks.append({
                    "uuid": gen_uuid(),
                    "type": "MULTIPLE_CHOICE_OPTION",
                    "groupUuid": mc_group,
                    "groupType": "MULTIPLE_CHOICE",
                    "payload": {
                        "index": i,
                        "isRequired": is_required if i == 0 else False,
                        "isFirst": i == 0,
                        "isLast": i == len(options) - 1,
                        "text": opt
                    }
                })
        else:
            # Simple input field
            input_type = type_map.get(field_type, "INPUT_TEXT")
            blocks.append({
                "uuid": gen_uuid(),
                "type": input_type,
                "groupUuid": gen_uuid(),
                "groupType": input_type,
                "payload": {
                    "isRequired": is_required,
                    "placeholder": placeholder
                }
            })
    
    return {
        "status": "PUBLISHED",
        "blocks": blocks
    }


# === Commands ===

def cmd_forms_list(args):
    """List all forms."""
    result = api_request("GET", "/forms", params={"limit": args.limit})
    print(json.dumps(result, indent=2))


def cmd_forms_get(args):
    """Get a single form."""
    result = api_request("GET", f"/forms/{args.form_id}")
    print(json.dumps(result, indent=2))


def cmd_forms_create(args):
    """Create a form from JSON file."""
    with open(args.json_file, "r") as f:
        data = json.load(f)
    
    # If it's a config format, convert it
    if "fields" in data and "blocks" not in data:
        data = build_form_with_options(data)
    
    result = api_request("POST", "/forms", data=data)
    print(json.dumps(result, indent=2))
    
    if "id" in result:
        print(f"\n✅ Form created! ID: {result['id']}", file=sys.stderr)
        print(f"📝 URL: https://tally.so/r/{result['id']}", file=sys.stderr)


def cmd_forms_create_simple(args):
    """Create a simple form from command line args."""
    data = build_simple_form(args.title, args.fields)
    result = api_request("POST", "/forms", data=data)
    print(json.dumps(result, indent=2))
    
    if "id" in result:
        print(f"\n✅ Form created! ID: {result['id']}", file=sys.stderr)
        print(f"📝 URL: https://tally.so/r/{result['id']}", file=sys.stderr)


def cmd_forms_update(args):
    """Update a form."""
    with open(args.json_file, "r") as f:
        data = json.load(f)
    result = api_request("PATCH", f"/forms/{args.form_id}", data=data)
    print(json.dumps(result, indent=2))


def cmd_forms_delete(args):
    """Delete a form."""
    result = api_request("DELETE", f"/forms/{args.form_id}")
    print(json.dumps(result, indent=2))


def cmd_submissions_list(args):
    """List submissions for a form."""
    params = {"limit": args.limit}
    if args.status:
        params["status"] = args.status
    result = api_request("GET", f"/forms/{args.form_id}/submissions", params=params)
    print(json.dumps(result, indent=2))


def cmd_submissions_get(args):
    """Get a single submission."""
    result = api_request("GET", f"/forms/{args.form_id}/submissions/{args.submission_id}")
    print(json.dumps(result, indent=2))


def cmd_submissions_delete(args):
    """Delete a submission."""
    result = api_request("DELETE", f"/forms/{args.form_id}/submissions/{args.submission_id}")
    print(json.dumps(result, indent=2))


def main():
    parser = argparse.ArgumentParser(description="Tally API CLI")
    subparsers = parser.add_subparsers(dest="resource", required=True)
    
    # Forms commands
    forms_parser = subparsers.add_parser("forms", help="Manage forms")
    forms_sub = forms_parser.add_subparsers(dest="action", required=True)
    
    # forms list
    list_parser = forms_sub.add_parser("list", help="List all forms")
    list_parser.add_argument("--limit", type=int, default=50)
    list_parser.set_defaults(func=cmd_forms_list)
    
    # forms get
    get_parser = forms_sub.add_parser("get", help="Get a form")
    get_parser.add_argument("form_id", help="Form ID")
    get_parser.set_defaults(func=cmd_forms_get)
    
    # forms create
    create_parser = forms_sub.add_parser("create", help="Create a form from JSON")
    create_parser.add_argument("json_file", help="JSON file with form config")
    create_parser.set_defaults(func=cmd_forms_create)
    
    # forms create-simple
    simple_parser = forms_sub.add_parser("create-simple", help="Create simple form")
    simple_parser.add_argument("--title", required=True, help="Form title")
    simple_parser.add_argument("--fields", required=True, 
        help="Fields spec: name:type:required,email:email:required")
    simple_parser.set_defaults(func=cmd_forms_create_simple)
    
    # forms update
    update_parser = forms_sub.add_parser("update", help="Update a form")
    update_parser.add_argument("form_id", help="Form ID")
    update_parser.add_argument("json_file", help="JSON file with updates")
    update_parser.set_defaults(func=cmd_forms_update)
    
    # forms delete
    delete_parser = forms_sub.add_parser("delete", help="Delete a form")
    delete_parser.add_argument("form_id", help="Form ID")
    delete_parser.set_defaults(func=cmd_forms_delete)
    
    # Submissions commands
    subs_parser = subparsers.add_parser("submissions", help="Manage submissions")
    subs_sub = subs_parser.add_subparsers(dest="action", required=True)
    
    # submissions list
    subs_list = subs_sub.add_parser("list", help="List submissions")
    subs_list.add_argument("form_id", help="Form ID")
    subs_list.add_argument("--limit", type=int, default=50)
    subs_list.add_argument("--status", choices=["IN_PROGRESS", "FINISHED"])
    subs_list.set_defaults(func=cmd_submissions_list)
    
    # submissions get
    subs_get = subs_sub.add_parser("get", help="Get a submission")
    subs_get.add_argument("form_id", help="Form ID")
    subs_get.add_argument("submission_id", help="Submission ID")
    subs_get.set_defaults(func=cmd_submissions_get)
    
    # submissions delete
    subs_del = subs_sub.add_parser("delete", help="Delete a submission")
    subs_del.add_argument("form_id", help="Form ID")
    subs_del.add_argument("submission_id", help="Submission ID")
    subs_del.set_defaults(func=cmd_submissions_delete)
    
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
