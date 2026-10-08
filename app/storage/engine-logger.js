"use strict";
/**
 * @file engine-logger.ts
 * @description Persistent file logger for the Balaboost Autotrade Engine.
 * Appends all engine activities, scans, signals, and broker executions to
 * ~/Library/Application Support/balaboost/logs/autotrade.log.
 * Pre-loads historical logs on app launch so terminal history survives app restarts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EngineLogger = void 0;
const electron_1 = require("electron");
const fs = require("fs");
const path = require("path");
class EngineLogger {
    constructor() {
        const { dirPath, filePath } = this.resolveLogPaths();
        this.logDirPath = dirPath;
        this.logFilePath = filePath;
        this.ensureDirectoryExists();
    }
    resolveLogPaths() {
        let dirPath = '';
        try {
            if (electron_1.app && typeof electron_1.app.getPath === 'function') {
                dirPath = path.join(electron_1.app.getPath('userData'), 'logs');
            }
        }
        catch (_a) {
            // fallback
        }
        if (!dirPath) {
            dirPath = path.join(process.cwd(), '.storage', 'logs');
        }
        return {
            dirPath,
            filePath: path.join(dirPath, 'autotrade.log')
        };
    }
    ensureDirectoryExists() {
        try {
            if (!fs.existsSync(this.logDirPath)) {
                fs.mkdirSync(this.logDirPath, { recursive: true });
            }
        }
        catch (e) {
            console.warn('[EngineLogger] Failed to create log directory:', e);
        }
    }
    getLogFilePath() {
        return this.logFilePath;
    }
    /**
     * Appends a log entry to the persistent autotrade.log file.
     * Performs automatic log rotation if the file exceeds 10 MB.
     */
    append(entry) {
        try {
            this.ensureDirectoryExists();
            this.checkAndRotate();
            const line = `[${entry.timeFormatted || new Date().toLocaleTimeString()} ET] [${(entry.level || 'info').toUpperCase()}] ${entry.message}\n`;
            fs.appendFileSync(this.logFilePath, line, 'utf-8');
        }
        catch (e) {
            console.warn('[EngineLogger] Failed to append log entry to disk:', e);
        }
    }
    /**
     * Rotates log file if it exceeds 10MB to prevent unbounded disk usage.
     */
    checkAndRotate() {
        try {
            if (fs.existsSync(this.logFilePath)) {
                const stats = fs.statSync(this.logFilePath);
                if (stats.size > 10 * 1024 * 1024) { // 10 MB
                    const backupPath = path.join(this.logDirPath, 'autotrade.old.log');
                    if (fs.existsSync(backupPath)) {
                        fs.unlinkSync(backupPath);
                    }
                    fs.renameSync(this.logFilePath, backupPath);
                }
            }
        }
        catch (e) {
            console.warn('[EngineLogger] Log rotation warning:', e);
        }
    }
    /**
     * Reads the most recent N log entries from disk to populate the in-memory terminal on launch.
     */
    getRecentLogs(maxCount = 300) {
        try {
            if (!fs.existsSync(this.logFilePath)) {
                return [];
            }
            const content = fs.readFileSync(this.logFilePath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim().length > 0);
            const recentLines = lines.slice(-maxCount);
            const parsed = [];
            for (const line of recentLines) {
                const match = line.match(/^\[(.*?) ET\] \[([A-Z]+)\] (.*)$/);
                if (match) {
                    const [, timeFormatted, levelStr, message] = match;
                    const levelLower = levelStr.toLowerCase();
                    const level = ['info', 'warn', 'success', 'error'].includes(levelLower)
                        ? levelLower
                        : 'info';
                    parsed.push({
                        id: Math.random().toString(36).substring(2, 9),
                        timestamp: new Date().toISOString(),
                        timeFormatted,
                        level,
                        message
                    });
                }
                else {
                    parsed.push({
                        id: Math.random().toString(36).substring(2, 9),
                        timestamp: new Date().toISOString(),
                        timeFormatted: '',
                        level: 'info',
                        message: line
                    });
                }
            }
            // Reverse so newest entries appear at the top of the array
            return parsed.reverse();
        }
        catch (e) {
            console.warn('[EngineLogger] Error reading recent logs:', e);
            return [];
        }
    }
}
exports.EngineLogger = EngineLogger;
//# sourceMappingURL=engine-logger.js.map