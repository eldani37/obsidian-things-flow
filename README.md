# Thing Flow: An Obsidian Plugin

Things Flow is a plugin for 2-way task syncing between Obsidian and Things 3, running on both iOS and macOS. It can create a Things project with to-dos and headings based on the tasks and headings in an Obsidian note. It can also sync task statuses back to Obsidian using an Apple Shortcut.

## How it works

| Obsidian | Things |
|---|---|
| Note | Project |
| To-do's deepest enclosing heading	|Heading |
|Headings with no to-dos directly under them| Omitted|
| Top-level task | To-do |
| Nested subtasks at any depth |  Checklist items |
| Task status `x` or `X`| Completed |
| Task status `-`| Canceled |
| Any other task status | Open |

To sync to Things, use the command or ribbon action.

To sync from Things, select plugin-generated projects in Things and run this [Apple Shortcut](https://www.icloud.com/shortcuts/8daa158808b34d3c8823b472f2262150). Recommend reviewing the shortcut before using it.

## Configuration

You can configure the plugin in Settings. 
### Task filtering
- **Ignore tasks with these statuses:** Tasks with the specified statuses will be ignored when syncing both to and from Things.
- **Only update tasks with these statuses:** Other tasks will be ignored when syncing from Things.

These options support custom task statuses. 

Note that ignoring a subtask does not necessarily ignore its own subtasks, because all subtasks are flattened into independent checklist items; however, ignoring a top-level task also ignores all its subtasks.
### After syncing
- **Change task status after copying to Things:** This will mark the tasks being synced to Things with the specified status.
- **Open corresponding notes after syncing:** When enabled, opens the Obsidian notes associated with the projects being synced. Disable this option to sync in the background.
### Identification
- **Always use full paths in Obsidian URLs in Things notes:** Keep this disabled for convenience when moving notes between folders, if you don't expect to reuse note names. Otherwise enable it to avoid linking to the wrong note.
## Limitations
- **Limited parsing:** Currently only task status are synced. Other metadata, like tags and dates, is treated as part of the task name.
- **Limited heading preservation:** Things headings do not support hierarchical structure, so not all headings will be preserved. See the [table](#how-it-works) above for details.
- **No duplicate detection:** Running the conversion multiple times may create duplicate projects in Things.
- **Text-based matching:** The plugin does not store Things IDs, so tasks are matched using text rather than unique identifiers. This means tasks sharing the same name and deepest heading (even if their higher level headings differ), or tasks whose names change after syncing, may result in unexpected or missed status updates. To-dos are matched by title and deepest heading, while checklist items are matched by item name, to-do title, and deepest heading.