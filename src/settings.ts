import { App, PluginSettingTab } from 'obsidian';
import ThingsPlugin from './main';

export interface ThingsPluginSettings {
	token: string;
	ignoreStatus: string;
	fullPath: boolean;
	areaLoc: 'none' | 'backlinks' | 'tags' | 'path';
	areaNames: string;
	openNotes: boolean;
	deleteUnsynced: boolean;
}

export const DEFAULT_SETTINGS: Partial<ThingsPluginSettings> = {
	token: '',
	ignoreStatus: '',
	openNotes: true,
	fullPath: false,
	areaLoc: 'none',
	areaNames: '',
	deleteUnsynced: false,
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
				type: 'group' as const,
				heading: 'Syncing to Things',
				items: [
					{
						name: 'Authentication token for Things URL scheme',
						desc: 'The token is essential for updating to-dos in Things. You can find it in the Things app under Settings > General > Things URLs.',
						control: {
							type: 'text' as const,
							key: 'token',
							placeholder: 'Enter your token here',
						},
					},{
						name: 'Task statuses to skip',
						desc: 'Top-level tasks with these statuses and their subtasks will be ignored unless already marked as successfully synced, so no new to-dos will be created for them. Leave empty to include all tasks. Enter task status symbols without separators.',
						control: {
							type: 'text' as const,
							key: 'ignoreStatus',
							placeholder: '"-x" to ignore Cancelled and Done tasks',
						},
					},{
						name: 'Always use full paths in Obsidian URLs in Things notes',
						desc: 'If disabled, the file basename will be used when it is unique. This setting may be overridden by the Path from the vault folder / current file option under New link format in Obsidian\'s Files and links settings.',
						control: {
							type: 'toggle' as const,
							key: 'fullPath',
						},
					},{
						name: 'Where to look for Things area names',
						desc: 'Choose where to look for area names when creating Things projects. Select "None" to skip area assignment.',
						control: {
							type: 'dropdown' as const,
							key: 'areaLoc',
							options:{
								none: 'None',
								backlinks: 'Backlinks',
								tags: 'Tags',
								path: 'File\'s full path', 
							},
						},
					},{
						name: 'Things area names to look for',
						desc: 'Enter area names separated by semicolons, with no extra spaces around the semicolons. Case insensitive.',
						control: {
							type: 'text' as const,
							key: 'areaNames',
							placeholder: 'Work;Hobby & Interests;Personal',
							visible: () => this.plugin.settings.areaLoc !== 'none',
						},
					}
				],
			},{
				type: 'group' as const,
				heading: 'Syncing from Things',
				items: [
					{
						name: 'Delete tasks not included in the sync',
						desc: 'If enabled, top-level tasks that are not included in the sync along with their subtasks will be deleted from the note. Subtasks not included in the sync will be deleted regardless of this setting.',
						control: {
							type: 'toggle' as const,
							key: 'deleteUnsynced',
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