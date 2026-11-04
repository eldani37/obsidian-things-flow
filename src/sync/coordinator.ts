import { Component, Notice, TFile, App, } from 'obsidian';
import { ThingsPluginSettings } from '../settings';
import { SyncEngine,  } from './engine';
import {getErrorMessage} from '../main';
import type {OutData, OutCallbackData, InSync} from './validation';
type SyncJob = {
    file: TFile;
    direction: 'outbound';
    timeoutId: ReturnType<typeof window.setTimeout>;
    expired: boolean;
    expiredAt?: number;
}|{
    file: TFile;
    direction: 'inbound';
};

function runSyncUrl(data: OutData, syncId: string) {
    // build url
    const callback = encodeURIComponent(`obsidian://things-flow-callback?sid=${encodeURIComponent(syncId)}`);
    window.open(
        `shortcuts://x-callback-url/run-shortcut?name=Obsidian2Things&input=text&text=${
            encodeURIComponent(JSON.stringify(data))
        }&x-success=${
            callback
        }&x-cancel=${
            callback
        }&x-error=${
            callback
    }`);
}

const syncTimeoutMs = 60*1000;
const syncCleanMs = 10*60*1000;

export class SyncCoordinator extends Component {
    private readonly syncJobs = new Map<string, SyncJob>();
    private syncEngine: SyncEngine;
    constructor(app: App, settings: ThingsPluginSettings) {
        super();
        this.syncEngine = new SyncEngine(app, settings);
    }

    private cleanupExpired() {
        const cutoff = Date.now() - syncCleanMs;
        this.syncJobs.forEach((syncJob, syncId) => {
            if (syncJob.direction === 'outbound' && syncJob.expired && syncJob.expiredAt !== undefined && syncJob.expiredAt < cutoff) {
                this.syncJobs.delete(syncId);
            }
        });
    }
    private checkFileReady(file: TFile): boolean {
        const expired: string[] = [];
        for (const [syncId, syncJob] of this.syncJobs) {
            if (syncJob.file === file) {
                if (syncJob.direction === 'outbound' && syncJob.expired) {
                    expired.push(syncId);
                } else {
                    return false;
                }
            }
        }
        expired.forEach((syncId) => {
            this.syncJobs.delete(syncId);
        });
        return true;
    }
    private begin(file: TFile, direction: 'inbound' | 'outbound'): string | undefined {
        this.cleanupExpired();
        if (!this.checkFileReady(file)) {
            return undefined;
        }
        const syncId = crypto.randomUUID();
        let syncJob: SyncJob;
        if (direction === 'outbound') {
            syncJob = {
                file,
                direction,
                timeoutId: window.setTimeout(() => {
                    const syncJob = this.syncJobs.get(syncId);
                    if (syncJob?.direction === 'outbound') {
                        syncJob.expired = true;
                        syncJob.expiredAt = Date.now();
                        console.warn(`Sync timed out for note: ${syncJob.file.path}`);
                        new Notice(`Timed out waiting for callback to complete this outbound sync for note ${syncJob.file.path}.`);
                    }
                }, syncTimeoutMs),
                expired: false,
            };
        } else {
            syncJob = {
                file,
                direction,
            };
        }
        this.syncJobs.set(syncId, syncJob);
        return syncId;
    }
    private finish(syncId: string) {
        const syncJob = this.syncJobs.get(syncId);
        if (syncJob) {
            if (syncJob.direction === 'outbound' && !syncJob.expired) {
                window.clearTimeout(syncJob.timeoutId);
            }
            this.syncJobs.delete(syncId);
        }
    }
    private getFile(syncId: string): TFile | undefined {
        const syncJob = this.syncJobs.get(syncId);
        return syncJob?.file;
    }
    async startOutboundSync(file: TFile) {
        const syncId = this.begin(file, 'outbound');
        if (!syncId) {
            throw new Error(`A sync is already in progress. Please wait for it to finish before starting a new sync.`);
        }
        try {
            runSyncUrl(await this.syncEngine.outbound(file), syncId);
        } catch (error) {
            this.finish(syncId);
            throw new Error(getErrorMessage(error));
        }
    }
    async finishOutboundSync(syncId: string, ids: OutCallbackData) {
        const file = this.getFile(syncId);
        if (!file) {
            throw new Error('Sync ID not found or already cleaned up.');
        }
        try {
            await this.syncEngine.outCallback(file, ids);
        } catch (error) {
            throw new Error(`Note ${file.path}: ${getErrorMessage(error)}`);
        } finally {
            this.finish(syncId);
        }
        return file.path;
    }
    async processInboundSync(sync: InSync) {
        const syncId = this.begin(sync.f, 'inbound');
        if (!syncId) {
            throw new Error(`A sync is already in progress for note "${sync.f.path}". Please wait for it to finish before starting a new sync.`);
        }
        try {
            await this.syncEngine.inbound(sync);
        } finally {
            this.finish(syncId);
        }
    }
    safeRemoveComments(file: TFile, content: string):  {ready: boolean, newContent?: string} {
        if (!this.checkFileReady(file)) {
            return {ready: false};
        }
        return {ready: true, newContent: this.syncEngine.removeComments(content)};
    }
    onunload() {
        this.syncJobs.forEach((syncJob) => {
            if (syncJob.direction === 'outbound') {
                window.clearTimeout(syncJob.timeoutId);
            }
        });
        this.syncJobs.clear();
    }
}