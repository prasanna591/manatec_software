"""Workflow transition objects (AGENT.md §4 / §6).

Every workflow entity exposes ``valid_transitions`` as a list of objects::

    {"action", "label", "target_status", "required_permission"}

Clients render buttons only from this list and gate them on the permission.
``next_states``/``allowed`` (plain status strings) are deprecated aliases kept
for older clients.
"""
from __future__ import annotations

from typing import Iterable

# Non-advancing terminators get semantic actions so the UI can style them
# (danger) without hardcoding status names.
_SPECIAL_ACTIONS = {
    "cancelled": "cancel",
    "rejected": "reject",
}


def transition_objects(
    flow: Iterable[str],
    permission: str,
    labels: dict[str, str] | None = None,
    *,
    exclude: Iterable[str] = (),
    action_for: dict[str, str] | None = None,
) -> list[dict]:
    """Build ``valid_transitions`` objects from an allowed-status flow."""
    excluded = set(exclude)
    out: list[dict] = []
    for target in flow:
        if target in excluded:
            continue
        action = (action_for or {}).get(target, _SPECIAL_ACTIONS.get(target, "advance"))
        out.append(
            {
                "action": action,
                "label": (labels or {}).get(target, target.replace("_", " ").title()),
                "target_status": target,
                "required_permission": permission,
            }
        )
    return out


def transition_statuses(transitions: list[dict]) -> list[str]:
    """Deprecated legacy alias: just the target statuses."""
    return [t["target_status"] for t in transitions]