declare module 'node-ical' {
  import {type RRule} from 'rrule';

  /**
   * Minimal Fetch options type (subset of RequestInit) to avoid requiring DOM lib.
   */
  export type FetchOptions = {
    method?: string;
    /**
     * Accept common header container shapes without depending on DOM lib types.
     * - Plain object map
     * - Any iterable of [key,value] tuples (covers Arrays and WHATWG Headers at runtime)
     */
    headers?: Record<string, string> | Iterable<[string, string]>;
    /** Request body (caller supplied) */
    body?: unknown;
    /** Additional fetch options (e.g. agent, redirect, follow, timeout, signal, etc.) */
    [key: string]: unknown;
  };

  /**
     * Methods (Sync)
     */
  export type NodeICalSync = {
    parseICS: (body: string) => CalendarResponse;

    parseFile: (file: string) => CalendarResponse;
  };

  export const sync: NodeICalSync;

  /**
     * Methods (Async)
     */
  export type NodeICalAsync = {
    fromURL: ((url: string, callback: NodeIcalCallback) => void) & ((url: string, options: FetchOptions | NodeIcalCallback, callback?: NodeIcalCallback) => void) & ((url: string) => Promise<CalendarResponse>);

    parseICS: ((body: string, callback: NodeIcalCallback) => void) & ((body: string) => Promise<CalendarResponse>);

    parseFile: ((file: string, callback: NodeIcalCallback) => void) & ((file: string) => Promise<CalendarResponse>);
  };

  export const async: NodeICalAsync;

  /**
     * Methods (Autodetect)
     */
  export function fromURL(url: string, callback: NodeIcalCallback): void;

  export function fromURL(url: string, options: FetchOptions | NodeIcalCallback, callback?: NodeIcalCallback): void;

  export function fromURL(url: string): Promise<CalendarResponse>;

  export function parseICS(body: string, callback: NodeIcalCallback): void;

  export function parseICS(body: string): CalendarResponse;

  export function parseFile(file: string, callback: NodeIcalCallback): void;

  export function parseFile(file: string): CalendarResponse;

  /**
     * Response objects
     */
  export type NodeIcalCallback = (error: any, data: CalendarResponse | undefined) => void;

  export type CalendarResponse = Record<string, CalendarComponent>;

  export type CalendarComponent = VTimeZone | VEvent | VCalendar;

  export type VTimeZone = TimeZoneProps & TimeZoneDictionary;

  type TimeZoneProps = {
    type: 'VTIMEZONE';
    tzid: string;
    tzurl?: string;
  } & BaseComponent;

  type TimeZoneDictionary = Record<string, TimeZoneDef | undefined>;

  /**
   * Example :
   * TRIGGER:-P15M
   * TRIGGER;RELATED=END:P5M
   * TRIGGER;VALUE=DATE-TIME:19980101T050000Z
   */
  type Trigger = string;

  /**
   * https://www.kanzaki.com/docs/ical/valarm.html
   */
  export type VAlarm = {
    type: 'VALARM';
    action: 'AUDIO' | 'DISPLAY' | 'EMAIL' | 'PROCEDURE';
    trigger: Trigger;
    description?: string;
    /**
     * https://www.kanzaki.com/docs/ical/repeat.html
     */
    repeat?: number;
    /**
     * Time between repeated alarms (if repeat is set)
     * DURATION:PT15M
     */
    duration?: unknown;
    /**
     * Everything except DISPLAY
     * https://www.kanzaki.com/docs/ical/attach.html
     */
    attach: unknown;
    /**
     * For action = email
     */
    summary?: string;

    /**
     * For action = email
     */
    attendee?: Attendee;

  } & BaseComponent;

  export type VEvent = {
    type: 'VEVENT';
    method: Method;
    dtstamp: DateWithTimeZone;
    uid: string;
    sequence: string;
    transparency: Transparency;
    class: Class;
    summary: string;
    start: DateWithTimeZone;
    datetype: DateType;
    end: DateWithTimeZone;
    location: string;
    description: string;
    url: string;
    completion: string;
    created: DateWithTimeZone;
    lastmodified: DateWithTimeZone;
    rrule?: RRule;
    attendee?: Attendee[] | Attendee;
    recurrences?: Record<string, Omit<VEvent, 'recurrences'>>;
    status?: VEventStatus;

    // I am not entirely sure about these, leave them as any for now..
    organizer: Organizer;
    exdate: any;
    geo: any;
    recurrenceid: any;

    alarms?: VAlarm[];
  } & BaseComponent;

  /**
   * Contains alls metadata of the Calendar
   */
  export type VCalendar = {
    type: 'VCALENDAR';
    prodid?: string;
    version?: string;
    calscale?: 'GREGORIAN' | string;
    method?: Method;
    'WR-CALNAME'?: string;
    'WR-TIMEZONE'?: string;
  } & BaseComponent;

  export type BaseComponent = {
    params: any[];
  };

  export type TimeZoneDef = {
    type: 'DAYLIGHT' | 'STANDARD';
    params: any[];
    tzoffsetfrom: string;
    tzoffsetto: string;
    tzname: string;
    start: DateWithTimeZone;
    dateType: DateType;
    rrule: string;
    rdate: string | string[];
  };

  type Property<A> = PropertyWithArgs<A> | string;

  type PropertyWithArgs<A> = {
    val: string;
    params: A & Record<string, unknown>;
  };

  export type Organizer = Property<{
    CN?: string;
  }>;

  export type Attendee = Property<{
    CUTYPE?: AttendeeCUType;
    ROLE?: AttendeeRole;
    PARTSTAT?: AttendeePartStat;
    RSVP?: boolean;
    CN?: string;
    'X-NUM-GUESTS'?: number;
  }>;

  export type AttendeeCUType = 'INDIVIDUAL' | 'UNKNOWN' | 'GROUP' | 'ROOM' | string;
  export type AttendeeRole = 'CHAIR' | 'REQ-PARTICIPANT' | 'NON-PARTICIPANT' | string;
  export type AttendeePartStat = 'NEEDS-ACTION' | 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'DELEGATED';

  export type DateWithTimeZone = Date & {tz: string};
  export type DateType = 'date-time' | 'date';
  export type Transparency = 'TRANSPARENT' | 'OPAQUE';
  export type Class = 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
  export type Method = 'PUBLISH' | 'REQUEST' | 'REPLY' | 'ADD' | 'CANCEL' | 'REFRESH' | 'COUNTER' | 'DECLINECOUNTER';
  export type VEventStatus = 'TENTATIVE' | 'CONFIRMED' | 'CANCELLED';
}
