declare module 'node-ical' {
  import {RequestInit} from 'node-fetch';
  import {RRule} from 'rrule';

  /**
     * Methods (Sync)
     */
  export interface NodeICalSync {
    parseICS: (body: string) => CalendarResponse;

    parseFile: (file: string) => CalendarResponse;
  }

  export const sync: NodeICalSync;

  /**
     * Methods (Async)
     */
  export interface NodeICalAsync {
    fromURL: ((url: string, callback: NodeIcalCallback) => void) & ((url: string, options: RequestInit | NodeIcalCallback, callback?: NodeIcalCallback) => void) & ((url: string) => Promise<CalendarResponse>);

    parseICS: ((body: string, callback: NodeIcalCallback) => void) & ((body: string) => Promise<CalendarResponse>);

    parseFile: ((file: string, callback: NodeIcalCallback) => void) & ((file: string) => Promise<CalendarResponse>);
  }

  export const async: NodeICalAsync;

  /**
     * Methods (Autodetect)
     */
  export function fromURL(url: string, callback: NodeIcalCallback): void;

  export function fromURL(url: string, options: RequestInit | NodeIcalCallback, callback?: NodeIcalCallback): void;

  export function fromURL(url: string): Promise<CalendarResponse>;

  export function parseICS(body: string, callback: NodeIcalCallback): void;

  export function parseICS(body: string): CalendarResponse;

  export function parseFile(file: string, callback: NodeIcalCallback): void;

  export function parseFile(file: string): CalendarResponse;

  /**
     * Response objects
     */
  export type NodeIcalCallback = (error: any, data: CalendarResponse) => void;

  export type CalendarResponse = Record<string, CalendarComponent>;

  export type CalendarComponent = VTimeZone | VEvent;

  export type VTimeZone = TimeZoneProps & TimeZoneDictionary;

  interface TimeZoneProps extends BaseComponent {
    type: 'VTIMEZONE';
    tzid: string;
    tzurl: string;
  }

  type TimeZoneDictionary = Record<string, TimeZoneDef | undefined>;

  export interface VEvent extends BaseComponent {
    type: 'VEVENT';
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

    // I am not entirely sure about these, leave them as any for now..
    organizer: any;
    exdate: any;
    geo: any;
    recurrenceid: any;
  }

  export interface BaseComponent {
    params: any[];
  }

  export interface TimeZoneDef {
    type: 'DAYLIGHT' | 'STANDARD';
    params: any[];
    tzoffsetfrom: string;
    tzoffsetto: string;
    tzname: string;
    start: DateWithTimeZone;
    dateType: DateType;
    rrule: string;
    rdate: string | string[];
  }

  export type DateWithTimeZone = Date & {tz: string};
  export type DateType = 'date-time' | 'date';
  export type Transparency = 'TRANSPARENT' | 'OPAQUE';
  export type Class = 'PUBLIC' | 'PRIVATE' | 'CONFIDENTIAL';
}
