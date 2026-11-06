# Things Flow

Things Flow is an Obsidian plugin for 2-way task synchronization between Obsidian and Things 3 on both iOS and macOS. It can create a Things project with to-dos and headings based on the tasks and headings in an Obsidian note, and sync changes between Things and Obsidian. 
## Requirements
- The two required Apple Shortcuts described below, added to your device,
- An authentication token, if you want to update existing Things projects from Obsidian,
- Backups of your data, optional but recommended as a precaution against potential bugs or accidental changes.
## How it works
| Obsidian | Things |
|---|---|
|*Note* | *Project* |
|Note's Obsidian URL |Project notes $^*$|
| Matching area name in the metadata|Project area|
| *Task's deepest enclosing heading*|*Heading* $^*$|
|Heading with no task directly under them| Omitted $^\dagger$|
| *Top-level task* | *To-do* |
|First line of a task|To-do title|
|Line continuation of a task|To-do notes $^*$|
| Nested subtasks at any depth |  Checklist items |
| Task status `x` or `X`| Completed |
| Task status `-`| Canceled |
| Any other task status | Open |

\* Notes and heading names are synced only once during project creation, and not updated afterward.

$\dagger$ Headings created in Things are not automatically archived or deleted when they no longer contain any tasks.
### Syncing to Things
To sync the current note to Things, use the plugin command or ribbon action. This can either create a new project for it or update an existing one,

The plugin uses an [Apple Shortcut](https://www.icloud.com/shortcuts/858b963a09b842ca9a7f637bf4049826) during the process. Please make sure the shortcut is added to your device before syncing. 

It adds some sync markers to the note:
 - One right below the title stores the Things project ID,
 - Others after the corresponding headings and top-level tasks store their IDs.
 - In editing mode, markers appear as a tick or cross, indicating if the sync completed successfully and the plugin receives corresponding IDs.
 - Markers are hidden in reading view. 
 
These markers are required for future syncs. Deleting a marker leaves the corresponding to-do, heading, or project in Things unattached. Moving a marker together with its associated task or heading is safe. Please do not modify them unless you understand the consequences.

When updating a project, the shortcut asks if you want to delete Things to-dos that are not included in the current sync. If you confirm, then to-dos whose corresponding sync markers are not present in the note will be deleted. Checklist items (subtasks) deletion are synchronized regardless.
### Syncing from Things
To sync from Things, select plugin-generated projects in Things and run this [Apple Shortcut](https://www.icloud.com/shortcuts/fa38b61ee76447629e610274109540f5). 

Only tasks with sync markers and their subtasks will be modified or moved (and possibly deleted if you enable this option in Settings). Other parts of the note, including all the headings, will remain unchanged.

Recommend reviewing the shortcuts before using them.

## Important notes
### Keep the Obsidian URL valid
You can rename the generated project or edit its notes, as long as the Obsidian URL in the notes remains valid and points to the source note. This URL is used to identify the note when syncing task statuses back to Obsidian.

If the URL becomes invalid or points to the wrong note (e.g., after renaming the source note), recreate the project or manually update its notes with a valid Obsidian URL.

The [full path setting](#identification) determines which path format is used in Obsidian URLs. Short paths may point to the wrong note if another note reuses the same name, while full paths need to be updated if you move a note to a different folder.
### macOS support
Things Flow is designed to work on both iOS and macOS, but it has been tested only on iOS. If you encounter any issues on macOS, please let me know.
## Configuration

You can configure the plugin in Settings. 
### Basics
- **Authentication token for Things URL scheme:** Required for updating Things projects. Without it, the plugin can still create projects and sync changes from Things back to Obsidian. Only syncing to existing Things projects will be affected 
- **Delete tasks not included in the sync:** When enabled, to-dos deleted from Things wil also have their corresponding tasks deleted from Obsidian. Otherwise only their sync markers will be removed.
### Task status
- **Task statuses to skip:** Top-level tasks with the specified statuses will be ignored if not already associated with a Things to-do. Supports custom task statuses. 

### Identification
- **Always use full paths in Obsidian URLs in Things notes:** Keep this disabled for convenience when moving notes between folders, if you don't expect to reuse note names. Otherwise enable it to avoid linking to the wrong note.
- **Where to look for Things area names:** You can choose tags, the file's full path, or backlinks as the source.
- **Things area names to look for:** Matching is case-insensitive, but be careful with spaces around semicolon separators, as they can affect matching.
### After syncing
- **Open corresponding notes after syncing:** When enabled, opens the Obsidian notes associated with the projects being synced. Disable this option to sync in the background.
## Limitations
- **Limited parsing:** Currently only task status are synced. Other metadata, like tags and dates, is treated as part of the task name.
- **Limited heading preservation:** Things headings do not support hierarchical structure, so not all headings will be preserved. See the [table](#how-it-works) above for details.
- **No duplicate detection:** If you delete a heading's sync marker and sync again, Things Flow will create a duplicate heading. To-dos will not be duplicated if you choose to delete tasks that are not included in the sync.
- **No notes syncing:** There is currently no way to sync project and to-do notes from Things back to Obsidian. To update a Things to-do's notes, delete its sync marker, sync again, and choose to delete tasks that are not included in the sync.

## Roadmap
- [x] Support updating existing Things projects when converting a note, rather than creating a new project each time.
