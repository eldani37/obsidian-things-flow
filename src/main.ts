import {
	Plugin,
	Notice,
	normalizePath,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	ThingsPluginSettings,
	ThingsSettingTab,
} from './settings';
import {dotPlugin} from './editor';
import {SyncCoordinator} from './sync/coordinator';
import {parseInboundData, parseCallbackData} from './sync/validation';
import type {ProjectIn} from './sync/validation';

export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default class ThingsPlugin extends Plugin {
	settings!: ThingsPluginSettings;
	private syncCoordinator!: SyncCoordinator;
	private async findProjectFile(proj: ProjectIn){
		const comment = `<!--things-project-id:${proj.id}-->`;
		const url = proj.notes.match(/^obsidian:\/\/open\?\S*/)?.[0];
		if (url && URL.canParse(url)) {
			const link = new URL(url);
			const vaultName = link.searchParams.get('vault');
			const path = link.searchParams.get('file');
			if (vaultName === this.app.vault.getName()) {
				if (path) {
					const file = this.app.metadataCache.getFirstLinkpathDest(normalizePath(path), '');
					if (file) {
						if ((await this.app.vault.cachedRead(file)).includes(comment)) {
							return file;
						} else {
							throw new Error(`Note at ${path} failed to match project ID.`);
						}
					} else {
						throw new Error(`File not found at ${path}: invalid path in project notes.`);
					}
				} else {
					throw new Error(`No path found in project notes.`);
				}
			} else {
				throw new Error(`Current vault is not ${vaultName}.`);
			}
		} else {
			throw new Error(`No valid Obsidian URL found in project notes.`);
		}
		// new Notice(`Could not find a note for project "${proj.title}" using project notes. Please make sure the notes contain a valid Obsidian URL to the note.`);
		// const bestTitle = this.app.metadataCache.getFirstLinkpathDest(normalizePath(`${proj.title}.md`), '');
		// if (bestTitle && (await this.app.vault.cachedRead(bestTitle)).includes(comment)) {
		// 	return bestTitle;
		// }
		// const markdownFiles = this.app.vault.getMarkdownFiles();
		// for (const file of markdownFiles) {
		// 	if (file.name === `${title}.md`) {
		// 		if ((await this.app.vault.cachedRead(file)).includes(comment)) {
		// 			return file;
		// 		}
		// 	}
		// }
		// console.warn(`Could not find a note for project "${title}" using project title.`);
		// for (const file of markdownFiles) {
		// 	if (file.name !== `${title}.md`) {
		// 		if ((await this.app.vault.cachedRead(file)).includes(comment)) {
		// 			return file;
		// 		}
		// 	}
		// }
		// console.warn(`Could not find a note for project "${title}" using project ID.`);
		// return undefined;
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ThingsSettingTab(this.app, this));
		this.syncCoordinator = this.addChild(new SyncCoordinator(this.app, this.settings));
		this.registerEditorExtension(dotPlugin);
		
		const outbound = async () => {
			const file = this.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') {
				new Notice('Please select a note to convert first.');
				return;
			}
			if (this.settings.token === '') {
				new Notice('Please enter your Things authentication token in the plugin settings. Existing to-dos in Things will not be updated without the token.');
			}
			try{
				await this.syncCoordinator.startOutboundSync(file);
			} catch (error) {
				console.error('Error starting sync to Things', error);
				new Notice(`Error starting sync to Things for note ${file.path}: ${getErrorMessage(error)}`);
			}
		}
		this.addCommand({
			id: 'tasks-to-things',
			name: 'Sync tasks to Things',
			icon: 'external-link',
			callback: outbound,
		});
		this.addRibbonIcon(
			'external-link', 
			'Sync tasks to Things',
			outbound,
		);
		this.registerObsidianProtocolHandler(
			'things-flow-callback', 
			async (input) => {
				try {
					const syncId = input['sid'];
					if (!syncId) {
						throw new Error(`Unrecognized callback: sync ID not found in URL params ${JSON.stringify(input)}.`);
					}
					const result = input['result'];
					if (!result) {
						throw new Error(`Result not found in URL params ${JSON.stringify(input)}.`);
					}
					const ids = parseCallbackData(result);
            		new Notice(`Successfully synced to Things for note: ${
						await this.syncCoordinator.finishOutboundSync(syncId, ids)
					}`);
				} catch (error) {
					console.error('Error finishing sync to Things', error);
            		new Notice(`Error finishing sync to Things : ${getErrorMessage(error)}`);
				}
			}
		);

		this.registerObsidianProtocolHandler(
			'things-flow-in', 
			async (input) => {
				let syncs;
				try {
					if (input['data'] === undefined) {
						throw new Error('Data not found in URL.');
					}
					syncs = parseInboundData(input['data']);
				} catch (error) {
					console.error('Error finishing sync from Things', error);
					new Notice(`Error finishing sync from Things : ${getErrorMessage(error)}`);
					return;
				}
				let errorCount = 0;
				for (const sync of syncs) {
					const proj = sync.p;
					try {
						const file = await this.findProjectFile(proj);
						await this.syncCoordinator.processInboundSync({f: file, ...sync});
						if (this.settings.openNotes) {
							const leaf = this.app.workspace.getLeaf(true);
							await leaf.openFile(file);
						}
					} catch (error) {
						console.warn(`Error syncing from Things for project "${proj.title}":`, error);
						new Notice(`Error syncing from Things for project "${proj.title}": ${getErrorMessage(error)}`);
						errorCount++;
					}
				}
        		new Notice(`Successfully synced from Things for ${syncs.length - errorCount} project(s), skipped ${errorCount}.`);
			}
		);
		this.addCommand({
			id: 'remove-comments',
			name: 'Remove generated sync marker from selection',
			icon: 'trash',
			editorCallback: (editor, view) => {
				const file = view.file;
				if (!file) {
					new Notice('No file is open.');
					return;
				}
				const selection = editor.getSelection();
				const {ready, newContent} = this.syncCoordinator.safeRemoveComments(file, selection);
				if (ready && newContent) {
					editor.replaceSelection(newContent);
				} else {
					new Notice('Could not remove sync marker: note has unfinished sync.');
				}
			},
		});
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		) as ThingsPluginSettings;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}