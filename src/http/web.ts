// ruby: apps/web/controllers/web.rb + apps/web/views/*.haml + public/style.css
//
// The Roda web UI, rendered as plain strings. docs/ARCHITECTURE.md says exact
// markup parity is NOT required (statuses, content types and redirects are), so
// these are straight transliterations of the Haml: same links, same headings,
// same text, same Bootstrap 3 classes, emitted as HTML5.

import type { Day } from '../core/day.js';
import { i18n } from '../core/i18n.js';
import type { CalendarConfig } from '../api/calendars-config.js';

/** ruby: config/parameters.yml, which the 2.7.0 image ships unedited. */
export const PARAMETERS = {
  contact: { name: 'Example Joe', email: 'email@example.com' },
} as const;

/** ruby: `ChurchCalendar::LANGS`. */
export const LANGS: readonly string[] = ['cs', 'en', 'fr', 'it', 'la'];

/** ruby: public/style.css, served by Roda's `r.public`. */
export const STYLE_CSS = `/* liturgical colour marks */
.celebration { display: inline-block; border-radius: 2px; margin: 3px; width: 1em; height: 1em; }
.red { background-color: #f33; }
.green { background-color: #3c3; }
.white { background-color: #fff; border: 1px solid #ccc; }
.violet { background-color: violet; }

/* circular buttons */
.btn-circle {
  width: 30px;
  height: 30px;
  text-align: center;
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.428571429;
  border-radius: 15px;
}`;

/** Minimal HTML escaping, as Haml's `=` does by default. */
export function h(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** ruby: apps/web/views/_layout.haml */
export function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset='utf-8'>
<meta content='width: device-width, initial-scale: 1' name='viewport'>
<title>Church Calendar API</title>
<!-- jquery -->
<script src='https://ajax.googleapis.com/ajax/libs/jquery/1.11.3/jquery.min.js'></script>
<!-- bootstrap -->
<link href='https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/css/bootstrap.min.css' rel='stylesheet'>
<script src='https://maxcdn.bootstrapcdn.com/bootstrap/3.3.5/js/bootstrap.min.js'></script>
<link href='/style.css' rel='stylesheet' type='text/css'>
</head>
<body>
<nav class='navbar navbar-default'>
<div class='container'>
<ul class='nav navbar-nav'>
<li><a href='/'>Home</a></li>
<li><a href='/browse'>Browse Calendar</a></li>
<li><a href='/api-doc'>API Documentation</a></li>
<li><a href='/about'>About</a></li>
</ul>
<ul class='nav navbar-nav pull-right'>
<li><a href='https://github.com/igneus/church-calendar-api'>Fork me at Github</a></li>
</ul>
</div>
</nav>
<div class='container'>
${content}
</div>
</body>
</html>
`;
}

/** ruby: apps/web/views/index.haml */
export function indexView(): string {
  return layout(`<div class='jumbotron'>
<h1>Liturgical Calendar API</h1>
<p>
<a href='/browse'>Browse</a>
the calendar on-line,
<br>
Learn how to obtain data from it's JSON
<a href='/api-doc'>API</a>
<br>
or
<a href='http://github.com/igneus/church-calendar-api'>fork it at github</a>
and hack it.
</p>
</div>
<p>
The API provides access to Roman Catholic liturgical calendar
according to the norms set forth by the liturgical reform
after the II Vatican Council. Several Sanctorale calendars
are available and others can be added easily.
</p>`);
}

/** ruby: apps/web/views/about.haml */
export function aboutView(maintainer: string, email: string): string {
  return layout(`<div class='page-header'>
<h1>About</h1>
</div>
<h2>Purpose</h2>
<p>
<b>Liturgical Calendar API</b>
exposes Roman Catholic liturgical calendar computed
according to the norms set forth by the liturgical reform
after the II Vatican Council. Several Sanctorale calendars
are available and others can be added easily.
</p>
<p>
Expected audience are developers of websites and other Internet
applications needing access to calendar information.
</p>
<h2>I have encountered an error</h2>
<p>
Please
<a href='https://github.com/igneus/church-calendar-api/issues'>let us know!</a>
</p>
<h2>I would like to run my own instance</h2>
<p>
You are most welcome!
Church Calendar API is free software under the
<a href='https://www.gnu.org/licenses/lgpl-3.0.en.html'>GNU/LGPL 3</a>
license.
Full source code together with installation instructions is at
<a href='https://github.com/igneus/church-calendar-api/'>github</a>
</p>
<h2>Contact</h2>
<p>
This instance of Liturgical Calendar API is maintained by
<br>
${h(maintainer)}
<a href='${h(email)}'>${h(email)}</a>
</p>`);
}

/** ruby: apps/web/views/_calselect.haml */
function calSelect(calendars: Readonly<Record<string, CalendarConfig>>, cal: string): string {
  const items = Object.entries(calendars)
    .map(([key, data]) => `<li><a href='/browse/${h(key)}'>${h(data.title)}</a></li>`)
    .join('\n');
  return `<h2>${h(calendars[cal]?.title ?? '')}</h2>
<p>
<div class='dropdown'>
<button class='btn btn-default dropdown-toggle' data-toggle='dropdown' id='select-calendar' type='button'>
Select Calendar
<span class='caret'></span>
</button>
<ul class='dropdown-menu'>
${items}
</ul>
</div>
</p>`;
}

export interface BrowseLocals {
  startYear: number;
  endYear: number;
  todayYear: number;
  todayMonth: number;
  cal: string;
  calendars: Readonly<Record<string, CalendarConfig>>;
}

/** ruby: apps/web/views/browse.haml */
export function browseView(l: BrowseLocals): string {
  const rows: string[] = [];
  for (let year = l.startYear; year <= l.endYear; year += 1) {
    const buttons: string[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const primary = year === l.todayYear && month === l.todayMonth;
      const cls = `btn btn-circle ${primary ? 'btn-primary' : 'btn-default'}`;
      buttons.push(`<a class='${cls}' href='/browse/${h(l.cal)}/${year}/${month}'>${month}</a>`);
    }
    rows.push(`<p>\n<strong>${year}</strong>\n${buttons.join('\n')}\n</p>`);
  }
  return layout(`<div class='page-header'>
<h1>Browse Church Calendar</h1>
</div>
${calSelect(l.calendars, l.cal)}
${rows.join('\n')}`);
}

export interface MonthLocals {
  year: number;
  month: number;
  entries: readonly Day[];
  cal: string;
  calendars: Readonly<Record<string, CalendarConfig>>;
}

/** ruby: apps/web/views/month.haml */
export function monthView(l: MonthLocals): string {
  const pages: string[] = [];
  if (l.month > 1) {
    pages.push(`<li><a href='/browse/${h(l.cal)}/${l.year}/${l.month - 1}'>&laquo;</a></li>`);
  }
  for (let i = 1; i <= 12; i += 1) {
    const cls = l.month === i ? " class='active'" : '';
    pages.push(`<li${cls}><a href='/browse/${h(l.cal)}/${l.year}/${i}'>${i}</a></li>`);
  }
  if (l.month < 12) {
    pages.push(`<li><a href='/browse/${h(l.cal)}/${l.year}/${l.month + 1}'>&raquo;</a></li>`);
  }

  const rows = l.entries.map((d) => {
    const cells = d.celebrations
      .map((c) => {
        // ruby: `= "#{c.title}#{', ' + r if r}"` with `r = c.rank.short_desc`
        const r = c.rank.shortDesc();
        return (
          `<div>\n<span class='celebration ${h(c.colour.symbol)}'>&nbsp;</span>\n` +
          `${h(c.title)}${r ? `, ${h(r)}` : ''}\n</div>`
        );
      })
      .join('\n');
    return (
      `<tr id='${d.date.day}'>\n<td class='tar'>${d.date.day}</td>\n` +
      `<td>${h(i18n.t(`weekday.${d.weekday()}`))}</td>\n<td>\n${cells}\n</td>\n</tr>`
    );
  });

  return layout(`<div class='page-header'>
<h1>Browse Church Calendar</h1>
</div>
${calSelect(l.calendars, l.cal)}
<nav>
<ul class='pagination'>
${pages.join('\n')}
</ul>
</nav>
<h2>${l.year} / ${l.month}</h2>
<table class='table table-striped'>
${rows.join('\n')}
</table>`);
}

/** ruby: apps/web/views/apidoc.haml — static content, ported to HTML. */
export function apiDocView(): string {
  const dayExample = `{
  "date":"2015-06-27",
  "season":"ordinary",
  "season_week":12,
  "celebrations":[
    {"title":"","colour":"green","rank":"ferial","rank_num":3.13},
    {"title":"Saint Cyril of Alexandria, bishop and doctor","colour":"white","rank":"optional memorial","rank_num":3.12}
  ],
  "weekday":"saturday"
}`;
  return layout(`<div class='page-header'>
<h1>API Documentation</h1>
</div>
<p>
The Church Calendar API provides access to calendar data
for any day.
</p>
<p>
<strong>Swagger:</strong>
Apart of this documentation for humans, there is also a
<strong><a href='/swagger.yml'>Swagger documentation,</a></strong>
which can be loaded in your favourite
<a href='http://petstore.swagger.io'>Swagger API browser</a>
or even used to
<a href='https://github.com/swagger-api/swagger-codegen'>generate client code.</a>
</p>
<h2>Client libraries</h2>
<ul>
<li>
<strong>Ruby:</strong>
<a href='https://github.com/igneus/calendarium-romanum-remote'>calendarium-romanum-remote</a>
</li>
</ul>
<h2>Specify API Version and Language</h2>
<p>
API version must be specified at the beginning of each request path
<code>/api/:version/:lang</code>
Right now the API only has version 0
<code>v0</code>
and a few supported languages:
</p>
<ul>
<li><code>en</code> English</li>
<li><code>fr</code> French</li>
<li><code>it</code> Italian</li>
<li><code>la</code> Latin</li>
<li><code>cs</code> Czech</li>
</ul>
<p>
Full example:
<code>/api/v0/en</code>
</p>
<p>
Due to a design flaw this API version handles
<em>temporale</em>
and
<em>sanctorale</em>
feast names independently.
Temporale feast names are governed by language specified
in request path.
E.g.
<code>/api/v0/en/calendars/czech/...</code>
would return a mixture of Czech (for sanctorale)
and English (for temporale) feast names.
In order to have all Czech, it is necessary to specify Czech language.
<code>/api/v0/cs/calendars/czech/...</code>
</p>
<p>
In the following examples the common beginning explained above
is omitted for brevity.
</p>
<h2>Select Calendar to Query</h2>
<div class='panel panel-default'>
<div class='panel-heading'>
<b><a href='/api/v0/en/calendars'>/calendars</a></b>
</div>
<div class='panel-body'>
<p>
The API offers several sanctorale calendars to choose from -
e.g. General Roman Calendar in Latin and English.
<code>/calendars</code>
returns list of their identifiers.
</p>
<pre>${h('[\n  "default",\n  "general-la",\n  "general-en",\n  "czech"\n]')}</pre>
</div>
</div>
<div class='panel panel-default' id='calendar-desc'>
<div class='panel-heading'>
<b><a href='/api/v0/en/calendars/default'>/calendars/:cal</a></b>
<br>
<a href='/api/v0/en/calendars/default'>/calendars/default</a>
<br>
<a href='/api/v0/en/calendars/general-en'>/calendars/general-en</a>
</div>
<div class='panel-body'>
<p>Fetches description of the selected calendar.</p>
<p>
The description has two parts.
<b>system</b>
describes the calendar system (which is the same for the whole API),
<b>sanctorale</b>
describes the selected set of data of sanctorale feasts.
</p>
<pre>${h(`{
  "system": {
    "promulgated": 1969,
    "effective_since": 1970,
    "desc": "promulgated by motu proprio Mysterii Paschalis of Paul VI. (AAS 61 (1969), pp. 222-226)."
  },
  "sanctorale": {
    "title": "Calendarium Romanum Generale",
    "language": "la"
  }
}`)}</pre>
</div>
</div>
<h2>Query the Calendar</h2>
<div class='panel panel-default'>
<div class='panel-heading'>
<b><a href='/api/v0/en/calendars/default/today'>/calendars/:cal/today</a></b>
<br>
<b><a href='/api/v0/en/calendars/default/yesterday'>/calendars/:cal/yesterday</a></b>
<br>
<b><a href='/api/v0/en/calendars/default/tomorrow'>/calendars/:cal/tomorrow</a></b>
</div>
<div class='panel-body'>
<p>
Convenience shortcuts to get calendar entries for the current
day and for the previous and next one.
</p>
<p>
By default date and time of the server's time zone is used.
Alternatively, if the client provides it's local time in the
<code>Date</code>
HTTP header, the server respects it.
But specifying date in request path is definitely
the preferred way.
</p>
<pre>${h(dayExample)}</pre>
<div class='alert alert-info'>
<p>
<strong>Useful shortcut:</strong>
If you wish to query the
<a href='/api/v0/en/calendars/default'>default calendar,</a>
you may omit
<code>/calendars/default</code>
from the path. The API will redirect you with status 301
to the full path.
E.g.
<code><a href='/api/v0/en/today'>/today</a></code>
redirects to
<code>/calendars/default/today</code>
</p>
</div>
</div>
</div>
<div class='panel panel-default'>
<div class='panel-heading'>
<b><a href='/api/v0/en/calendars/default/2015/6/27'>/calendars/:cal/:year/:month/:day</a></b>
</div>
<div class='panel-body'>
<p>
Returns
<a href='#day-struct'>Day entry</a>
for the specified day.
</p>
<div class='alert alert-warning'>
<p>
<strong>Date of effectiveness as limit:</strong>
The API refuses requests for dates with year being older than
the year when the calendar system became effective.
You can find it by hitting the
<a href='#calendar-desc'>calendar description route.</a>
</p>
</div>
</div>
</div>
<div class='panel panel-default'>
<div class='panel-heading'>
<b><a href='/api/v0/en/calendars/default/2015/6'>/calendars/:cal/:year/:month</a></b>
</div>
<div class='panel-body'>
<p>
Returns an array of
<a href='#day-struct'>Day entries</a>
for all days of the specified month
</p>
</div>
</div>
<div class='panel panel-default'>
<div class='panel-heading'>
<b><a href='/api/v0/en/calendars/default/2015'>/calendars/:cal/:year</a></b>
</div>
<div class='panel-body'>
<pre>{"lectionary":"C","ferial_lectionary":2}</pre>
<p>Returns the year's common "liturgical setup".</p>
<div class='alert alert-warning'>
<strong>Civil vs. liturgical year:</strong>
A liturgical year begins in November or December with the 1st Sunday of Advent.
Thus
<code>/api/v0/en/2015</code>
returns information concerning the liturgical year 2015-2016.
</div>
</div>
</div>
<h2>Data Structures</h2>
<p>
The API mostly returns representations of liturgical days.
On each liturgical day one or more celebrations occur.
</p>
<h3 id='day-struct'>Liturgical Day</h3>
<pre>${h(dayExample)}</pre>
<ul>
<li><b>date:</b> ISO 8601 date</li>
<li><b>season:</b> ordinary/advent/christmas/lent/easter</li>
<li><b>season_week:</b> ordinal number of the season's week</li>
<li><b>weekday</b> name of the weekday, lowercased</li>
<li><b>celebrations</b> array of alternative celebrations for the day</li>
</ul>
<h3 id='celebration-struct'>Celebration</h3>
<pre>${h('{"title":"Saint Cyril of Alexandria, bishop and doctor","colour":"white","rank":"optional memorial","rank_num":3.12}')}</pre>
<ul>
<li><b>title:</b> name of the celebration, may be empty</li>
<li><b>colour:</b> green/violet/white/red</li>
<li><b>rank:</b> textual description of celebration rank</li>
<li><b>rank_num:</b> celebration rank as number. The lower number, the higher priority.</li>
</ul>`);
}
