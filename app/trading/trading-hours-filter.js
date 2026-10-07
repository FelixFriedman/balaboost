"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingHoursFilter = void 0;
class TradingHoursFilter {
    constructor(initialConfig) {
        this.config = {
            enabled: true,
            startTime: '10:00', // 10:00 AM ET (avoids 9:30-10:00 AM opening volatility)
            endTime: '15:00', // 3:00 PM ET (avoids 3:00-4:00 PM pin risk and closing spreads)
            allowWeekend: false,
            allowOutsideHoursPaper: false
        };
        if (initialConfig) {
            this.config = Object.assign(Object.assign({}, this.config), initialConfig);
        }
    }
    getConfig() {
        return Object.assign({}, this.config);
    }
    setConfig(update) {
        this.config = Object.assign(Object.assign({}, this.config), update);
        return Object.assign({}, this.config);
    }
    /**
     * Evaluates the trading window and US market status at a given moment in time.
     */
    getStatus(date = new Date()) {
        const et = this.getEasternTimeParts(date);
        const { hour, minute, weekday, totalMinutes, formattedClock, formattedDate } = et;
        const isWeekend = weekday === 'Sat' || weekday === 'Sun';
        const isHoliday = this.isMarketHoliday(et.year, et.month, et.day);
        // Regular US Equity/Options Hours: 9:30 AM (570 min) - 4:00 PM (960 min) ET
        const marketOpenMin = 9 * 60 + 30; // 570
        const marketCloseMin = 16 * 60; // 960
        const preMarketMin = 4 * 60; // 240 (4:00 AM)
        const afterHoursMin = 20 * 60; // 1200 (8:00 PM)
        let marketStatus = 'closed';
        if (isWeekend || isHoliday) {
            marketStatus = 'closed';
        }
        else if (totalMinutes >= marketOpenMin && totalMinutes < marketCloseMin) {
            marketStatus = 'open';
        }
        else if (totalMinutes >= preMarketMin && totalMinutes < marketOpenMin) {
            marketStatus = 'pre_market';
        }
        else if (totalMinutes >= marketCloseMin && totalMinutes < afterHoursMin) {
            marketStatus = 'after_hours';
        }
        else {
            marketStatus = 'closed';
        }
        // Configured window
        const [startH, startM] = this.config.startTime.split(':').map(Number);
        const [endH, endM] = this.config.endTime.split(':').map(Number);
        const windowStartMin = startH * 60 + startM;
        const windowEndMin = endH * 60 + endM;
        let isWithinWindow = false;
        let windowStatus = 'paused';
        let reason = '';
        if (!this.config.enabled) {
            isWithinWindow = true;
            windowStatus = 'disabled';
            reason = 'Trading hours filter is disabled (Always Active)';
        }
        else if (isWeekend && !this.config.allowWeekend) {
            isWithinWindow = false;
            windowStatus = 'paused';
            reason = 'Weekend: US Options Exchanges Closed';
        }
        else if (isHoliday) {
            isWithinWindow = false;
            windowStatus = 'paused';
            reason = 'Market Holiday: US Options Exchanges Closed';
        }
        else if (marketStatus !== 'open') {
            isWithinWindow = false;
            windowStatus = 'paused';
            reason = marketStatus === 'pre_market'
                ? `Pre-market: Regular session opens at 9:30 AM ET`
                : `Market Closed: Regular session ended at 4:00 PM ET`;
        }
        else {
            // Market is open — check user window
            if (totalMinutes < windowStartMin) {
                isWithinWindow = false;
                windowStatus = 'paused';
                const startFormatted = this.formatMinutesToAmPm(windowStartMin);
                reason = `Opening Buffer Pause: Window opens at ${startFormatted} ET (avoiding 9:30 AM opening volatility)`;
            }
            else if (totalMinutes >= windowEndMin) {
                isWithinWindow = false;
                windowStatus = 'paused';
                const endFormatted = this.formatMinutesToAmPm(windowEndMin);
                reason = `Closing Buffer Pause: Window closed at ${endFormatted} ET (avoiding end-of-day pin risk & slippage)`;
            }
            else {
                isWithinWindow = true;
                windowStatus = 'active';
                const startF = this.formatMinutesToAmPm(windowStartMin);
                const endF = this.formatMinutesToAmPm(windowEndMin);
                reason = `Active Trading Window (${startF} – ${endF} ET)`;
            }
        }
        const canExecuteTrade = !this.config.enabled || isWithinWindow || this.config.allowOutsideHoursPaper;
        return {
            isWithinWindow,
            canExecuteTrade,
            marketStatus,
            windowStatus,
            currentEasternTime: `${et.hour.toString().padStart(2, '0')}:${et.minute.toString().padStart(2, '0')} ET`,
            currentEasternDate: formattedDate,
            formattedClock,
            reason,
            config: this.getConfig()
        };
    }
    /**
     * Helper to format minute-of-day (e.g. 600 -> "10:00 AM")
     */
    formatMinutesToAmPm(totalMinutes) {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const displayH = hours % 12 === 0 ? 12 : hours % 12;
        return `${displayH}:${mins.toString().padStart(2, '0')} ${ampm}`;
    }
    /**
     * Extracts Eastern Time (New York) components taking daylight saving into account.
     */
    getEasternTimeParts(date) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            weekday: 'short',
            hour12: false
        }).formatToParts(date);
        const get = (type) => { var _a; return ((_a = parts.find(p => p.type === type)) === null || _a === void 0 ? void 0 : _a.value) || '0'; };
        const year = parseInt(get('year'), 10);
        const month = parseInt(get('month'), 10);
        const day = parseInt(get('day'), 10);
        const hour = parseInt(get('hour'), 10);
        const minute = parseInt(get('minute'), 10);
        const second = parseInt(get('second'), 10);
        const weekday = get('weekday');
        const formattedClock = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        }).format(date);
        const formattedDate = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        }).format(date);
        return {
            year,
            month,
            day,
            hour,
            minute,
            second,
            weekday,
            totalMinutes: hour * 60 + minute,
            formattedClock,
            formattedDate
        };
    }
    /**
     * Simple check for major US market holidays
     */
    isMarketHoliday(year, month, day) {
        // New Year's Day (Jan 1)
        if (month === 1 && day === 1)
            return true;
        // Juneteenth (Jun 19)
        if (month === 6 && day === 19)
            return true;
        // Independence Day (Jul 4)
        if (month === 7 && day === 4)
            return true;
        // Christmas (Dec 25)
        if (month === 12 && day === 25)
            return true;
        return false;
    }
}
exports.TradingHoursFilter = TradingHoursFilter;
//# sourceMappingURL=trading-hours-filter.js.map