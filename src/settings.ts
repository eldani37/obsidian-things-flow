import { App, PluginSettingTab } from 'obsidian';
import ThingsPlugin from './main';

export interface ThingsPluginSettings {
	ignoreStatus: string;
	toStatus: string;
	onlyMode: boolean;
	onlyStatus: string;
	openNotes: boolean;
	fullPath: boolean;
}

export const DEFAULT_SETTINGS: Partial<ThingsPluginSettings> = {
	ignoreStatus: '',
	toStatus: '',
	onlyMode: false,
	onlyStatus: '',
	openNotes: true,
	fullPath: false,
};

export class ThingsSettingTab extends PluginSettingTab {
	plugin: ThingsPlugin;

	constructor(app: App, plugin: ThingsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
    	return [
    		{
				name: 'Filtering: ignore tasks with these statuses',
				desc: 'Leave empty to include all tasks. Enter task status symbols without separators. For example, enter "-x" to ignore Cancelled and Done tasks.',
				control: {
					type: 'text' as const,
					key: 'ignoreStatus',
					placeholder: '',
				},
			},{
				name: 'How task filtering works',
				desc: 'Ignoring a subtask does not necessarily ignore its own subtasks, because all subtasks are flattened into independent checklist items; however, ignoring a top-level task also ignores all its subtasks.'
			},{
				type: 'group' as const,
				heading: 'Syncing to Things',
				items: [
					{
						name: 'Change task status after copying to Things',
						desc: 'Leave empty to keep the original status. Enter a single status symbol to apply to tasks after copying them to Things. For example, enter "/" to set the status to "In Progress".',
						control: {
							type: 'text' as const,
							key: 'toStatus',
							placeholder: '',
							validate: (value: string) => (value.length > 1)? 'Please enter a single status symbol.': undefined,
						},
					},{
						name: 'Always use full paths in Obsidian URLs in Things notes',
						desc: 'If enabled, Obsidian URLs will use the note\'s full path. Otherwise, the file basename will be used when it is unique. This setting may be overridden by the Path from the vault folder / current file option under New link format in Obsidian\'s Files and links settings.',
						control: {
							type: 'toggle' as const,
							key: 'fullPath',
						},
					}
				],
			},{
				type: 'group' as const,
				heading: 'Syncing from Things',
				items: [
					{
						name: 'Restrict status updates',
						desc: 'If enabled, only tasks with the statuses specified below will be updated when syncing task statuses from Things. All other tasks will be ignored.',
						control: {
							type: 'toggle' as const,
							key: 'onlyMode',
						},
					},{
						name: 'Filtering: only update tasks with these statuses',
						desc: 'Only applies when the restriction above is enabled. Enter status symbols without separators. For example, enter " /" to only update Open and In Progress tasks.',
						control: {
							type: 'text' as const,
							key: 'onlyStatus',
							placeholder: '',
							disabled: () => !this.plugin.settings.onlyMode,
						},
					},{
						name: 'Open corresponding notes after syncing',
						desc: 'If enabled, notes linked to the Things projects being synced will be opened in Obsidian.',
						control: {
							type: 'toggle' as const,
							key: 'openNotes',
						},
					}
				]
			}
		];
	}
}