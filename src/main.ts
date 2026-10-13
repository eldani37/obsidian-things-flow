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

// from obsidian; out
type checklist = {
	type: 'checklist-item';
	attributes: {
		title: string;
		completed: boolean;
		canceled: boolean;
	}
};

type todo = {
	type: 'to-do';
	attributes: {
		title: string;
		completed: boolean;
		canceled: boolean;
		notes?: string;
		when?: string;
		deadlines?: string;
		'checklist-items'?: checklist[];
	}
};

type heading = {
	type: 'heading';
	attributes: {
		title: string;
	}
};

type project = {
	type: 'project';
	operation: 'create';
	attributes: {
		title: string;
		notes?: string;
		when?: string;
		deadlines?: string
		area?: string;
		completed?: boolean;
		canceled?: boolean;
		items: Array<todo|heading>;
	}
};

// from apple shortcut; in
type ToDo = {
	title: string;
	status: 'Open' | 'Completed' | 'Canceled';
	heading: string;
	checklist: string;
}

type Project = {
	title: string;
	notes: string;
	status: 'Open' | 'Completed' | 'Canceled';
	items: Array<ToDo>;
}

// union
type fParams = {
	mode: 'out';
	toStatus: string;
	vaultName: string;
	fileName: string;
	path: string;
	area?: string;
}|{
	mode: 'in';
	onlyMode: boolean;
	onlyStatus: string;
	proj: Project
}

// convert the status symbol to the status code used in obsidian
function statusCode(status: string): string {
	if (status.toLowerCase() === 'x' || status=== 'Completed') {
		return 'x';
	} else if (status === '-' || status === '~' || status === 'Canceled') {
		return '-';
	} else {
		return ' ';
	}
}
// find todo from things shortcut output project
function findTodo(proj: Project, title: string, heading: string): ToDo | undefined {
	return proj.items.find((item) => item.title === title && item.heading === heading);
}

function checkIgnored(status: string, params: fParams, ignoreStatus: string): boolean {
	return ignoreStatus.includes(status)||(params.mode === 'in' && params.onlyMode && !params.onlyStatus.includes(status));
}

// determine if the status needs updating
function newStatus(oldStatus: string, thingsStatus: string|undefined): string {
	if (thingsStatus && statusCode(oldStatus) !== statusCode(thingsStatus)) {
		return statusCode(thingsStatus);
	} else {return '';}
}

// turn the selected lines in the note into a project with todos and headings, in JSON format for things 
// every task is a todo, if having subtasks then checklist items (will be flattened)
// the most ajacent heading before the task is the heading for the task
// the project name is the filename
function processTasks(content: string, ignoreStatus: string, params: fParams): {newContent: string, url?: string} {

	let latest: todo | null = null;// the latest todo
	let level: number | null = null;// current level; to detect potential subtask
	let heading: string = '';// nearest heading
	const lines: string[] = [];
	const result: {newContent: string, url?: string} = {newContent: ''};
	// out mode: convert to things3 project
	const output: Array<todo | heading> = [];


	for (const line of content.split('\n')) {
		const match = line.match(/^(\s*)-\s\[([^\]])\]\s(.*)$/)
		if (match) {// case 1 & 2: task
			const space: string = match[1]!;
			const indent: number = space.replace(/\t/g, '    ').length;
			const status: string = match[2]!;
			const title: string = match[3]!;

			if (level !== null && indent > level) {// case 1: checklist item
				// no need to update level and latest
				// check if ignored
				if (!latest || checkIgnored(status, params, ignoreStatus)) {
					lines.push(line);
					continue;
				}
				// in: update the status; out: add to the latest todo and change the status if needed
				if (params.mode === 'out') {
					// if not having already a checklist, create one for the latest todo
					latest.attributes['checklist-items'] ??= [];
					latest.attributes['checklist-items'].push({
						type: 'checklist-item',
						attributes: {
							title,
							completed: status.toLowerCase() === 'x',
							canceled: status === '-',
						}
					});
				}
				let toStatus: string;
				if (params.mode === 'in') {
					const thingsStatus = findTodo(params.proj, latest.attributes.title, heading)?.checklist?.match(new RegExp('(\\n|^)-\\s\\[([\\s~x])\\]\\s' + title + '(\\n|$)'))?.[2];// find the checklist item in the project
					toStatus = newStatus(status, thingsStatus);
				} else {
					toStatus = params.toStatus;
				}
				if (toStatus !== '') {
					lines.push(space + `- [${toStatus}] ` + title);
				} else {
					lines.push(line);
				}
			} else {// case 2: todo

				level = indent;// update the level
				// update the latest todo
				if (checkIgnored(status, params, ignoreStatus)) {
					latest = null;
					lines.push(line);
					continue;
				} else {
					latest = {
						type: 'to-do',
						attributes: {
							title,
							completed: status.toLowerCase() === 'x',
							canceled: status === '-',
						}
					};
				}

				// in: update the status; out: add to the output and change the status if needed
				if (params.mode === 'out') {
					if (heading !== '') {// if there is a heading, add it to the project bc it has todos under it
						output.push({
							type: 'heading',
							attributes: {
								title: heading,
							}
						});
						heading = '';// avoid adding again
					}
					output.push(latest);
				}
				let toStatus: string;
				if (params.mode === 'in') {
					const thingsStatus = findTodo(params.proj,title,heading)?.status;
					toStatus = newStatus(status, thingsStatus);
				} else {
					toStatus = params.toStatus;
				}
				if (toStatus !== '') {
					lines.push(space + `- [${toStatus}] ` + title);
				} else {
					lines.push(line);
				}
			}
		} else {// case 3 - 5: not a task
			lines.push(line);
			if (level===null || !line.replace(/\t/g,'    ').match(new RegExp(`^\\s{${level+4},}-\\s`))) {// ignore case 3: a bullet that is deeper than (and thus belongs to) the current todo; no need to update level and latest
				const headingMatch = line.match(/^#+\s(.*)$/);
				if (headingMatch) {// case 4: heading; update the heading
					heading = headingMatch[1]!;
				}
				// case 4 & 5: a random line
				level = null;// reset the level
				latest = null;// reset the latest todo
			}
		}
	}

	result.newContent = lines.join('\n');
	if (params.mode === 'out') {
		const proj: project = {
			type: 'project',
			operation: 'create',
			attributes: {
				title: params.fileName,
				notes: `obsidian://open?${new URLSearchParams([['vault',params.vaultName],['file',params.path]]).toString().replaceAll('+','%20')}`,// to directly open the obsidian note
				area: params.area,
				items: output,
			}
		};
		const url = `things:///json?${new URLSearchParams([['data',JSON.stringify([proj])],['reveal','true']]).toString().replaceAll('+','%20')}`;
		if (URL.canParse(url)) {
			result.url = url;
		} else {
			new Notice('Error syncing to Things: URI not generated.');
		}
	}
	return result;
}

export default class ThingsPlugin extends Plugin {
	settings!: ThingsPluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ThingsSettingTab(this.app, this));
		const outFn = async () => {
			const file = this.app.workspace.getActiveFile();
			if (!file || file.extension !== 'md') {
				new Notice('Please select a note to convert first.');
				return;
			}
			const vaultName = this.app.vault.getName();
			const fileName = file.basename;
			const path = this.settings.fullPath ? file.path : this.app.metadataCache.fileToLinktext(file,'');
			let candidates: string[];
			switch (this.settings.areaLoc) {
				case 'backlinks':
					candidates = Object.entries(this.app.metadataCache.resolvedLinks).filter(([_, dest]) => file.path in dest).map(([source, _]) => source);
					break;
				case 'tags':
					candidates = this.app.metadataCache.getFileCache(file)?.tags?.map((tag) => tag.tag) ?? [];
					break;
				case 'path':
					candidates = [file.path];
					break;
				default:
					candidates = [];
			}
			const area: string | undefined = this.settings.areaNames.split(';').find((areaName)=>candidates.some((source) => source.toLowerCase().includes(areaName.toLowerCase())));
			await this.app.vault.process(file, (content) => {
				const result = processTasks(content, this.settings.ignoreStatus, {mode: 'out', toStatus: this.settings.toStatus, vaultName, fileName, path, area});
				if (result.url){
					window.open(result.url);
					return result.newContent;
				} else {
					return content;
				}
			})
		}
		
		this.addCommand({
			id: 'tasks-to-things',
			name: 'Convert to Things project',
			icon: 'external-link',
			callback: outFn,
		});
		this.addRibbonIcon(
			'external-link', 
			'Convert to Things project', 
			outFn);
		
		this.registerObsidianProtocolHandler('things-flow', async (input) => {// for syncing from things3 to obsidian using the things3 shortcut and obsidian url
			const projects: Array<Project> = JSON.parse(input['data']!) as Array<Project>;
			for (const proj of projects) {
				const match = proj.notes.match(/^obsidian:\/\/open\?\S*/)?.[0];
				if (!match || !URL.canParse(match)) {
					new Notice(`Invalid obsidian URL: ${proj.notes}`);
					continue;
				}
				const link = new URL(match);
				const vaultName = link.searchParams.get('vault');
				if (vaultName !== this.app.vault.getName()) {
					new Notice(`Vault name mismatch: ${vaultName} vs ${this.app.vault.getName()}`);
					continue;
				}
				const path = link.searchParams.get('file');
				if (!path) {
					new Notice(`File path not found in URL: ${proj.notes}`);
					continue;
				}
				const file = this.app.metadataCache.getFirstLinkpathDest(normalizePath(path), '');
				if (!file) {
					new Notice(`File not found: ${vaultName}/${path}`);
					continue;
				}
				await this.app.vault.process(file, (content) => {
					return processTasks(content, this.settings.ignoreStatus, {mode: 'in', onlyMode: this.settings.onlyMode, onlyStatus: this.settings.onlyStatus, proj}).newContent;
				});
				if (this.settings.openNotes) {
					const leaf = this.app.workspace.getLeaf(true);
					await leaf.openFile(file);
				}
			}
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