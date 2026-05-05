/**
 * Side-effect imports that register every built-in tool handler with the
 * shared registry in ../router. The top-level toolCallRouter barrel
 * imports this module so registrations happen once, synchronously, on
 * first access of the public dispatch API.
 *
 * Add new handler modules here. Handler order does not matter.
 */

import './simpleCards';
import './session';
import './timers';
import './notes';
import './music';
import './dashboardThemeTool';
import './finance';
import './search';
import './weather';
import './calendar';
import './sports';
import './camera';
import './places';
import './obsidian';
import './routines';
import './chores';
import './smartHome';
import './flights';
import './gmail';
import './outlookCalendar';
import './outlookMail';
import './github';
import './slack';
