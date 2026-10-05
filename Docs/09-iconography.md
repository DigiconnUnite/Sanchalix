# 09 · Iconography (Reicon)

Vidyawan uses **Reicon** (`reicon-react`) as its only icon library, rendered through Cloudscape's custom-icon slots. This document is the single source of truth for which icon means what. The code mirror of the map below is `src/components/icons.tsx`, and the two must always match. Decision record: [ADR-004](23-decision-log.md#adr-004-reicon-over-cloudscape-built-in-icons). Layout and component usage: [08-design-system.md](08-design-system.md).

## 1. Rules

| # | Rule |
|---|---|
| 1 | **One library.** Only `reicon-react`. No Cloudscape `iconName` in app code, no other icon packages, no hand-written inline `<svg>`. |
| 2 | **One import path.** Features import icon keys from `@/components/icons`. Only `icons.tsx` imports from `reicon-react`, and it uses direct imports (`reicon-react/icons/Home`) for the smallest bundle. |
| 3 | **Through Cloudscape slots.** Use `iconSvg` on `Button`, `ButtonDropdown` items, `ButtonGroup`, `SegmentedControl`, `Select`/`Autosuggest` options, `TokenGroup`, `TopNavigation` utilities and `AppLayout` drawers. Use `svg` on `<Icon />` everywhere else, including the `icon` slot of `SideNavigation` links. This keeps Cloudscape's spacing, alignment, hover, disabled and focus states. |
| 4 | **Size set by Cloudscape.** The Cloudscape slot owns the size and the glyph fills it. The scale is 16px (`normal`, the default inline and button size), 20px (`medium`, navigation and headers), 32px (`big`) and 48px (`large`, empty states and illustrations). No other sizes. |
| 5 | **Colour from context.** Glyphs paint with `currentColor`. Never pass a hex `color`. When an icon needs a colour, set Cloudscape `<Icon variant>` (`success`, `warning`, `error`, `info`, `subtle`, `link`) or wrap it in text styled with a design token. |
| 6 | **Weight.** `Outline` by default. `Filled` only for the active or selected state (the current side-nav item, a pressed toggle, a starred item) and for status emphasis (an at-risk flag, an overdue badge). |
| 7 | **One icon per concept.** A concept always uses the same icon, and the same icon never means two unrelated things (see the map). Adding a concept means adding a row here and a key in `icons.tsx` in the same PR. |
| 8 | **Accessibility.** Glyphs are decorative (`aria-hidden="true"`, `focusable="false"`), and the helper sets both. An icon-only button must have `ariaLabel`. An icon that carries meaning with no adjacent text gets `ariaLabel` on `<Icon>`. |
| 9 | **Never alone for status.** Status is always icon + text (Cloudscape `StatusIndicator`), never icon or colour alone (WCAG 1.4.1). |

## 2. How the integration works

Reicon renders `<svg viewBox="0 0 24 24" fill="none">` with filled inner paths (`fill="currentColor"`). When a slot's root node is an `<svg>`, Cloudscape forces `stroke="currentColor"` and a size-based stroke width onto it, which would thicken every Reicon glyph. Cloudscape's documented escape hatch is to wrap the `<svg>` in a `<span>`. The `svg()` helper does exactly that and sizes the glyph to 100% of the slot, so the Cloudscape component decides the pixel size.

### `src/components/icons.tsx`

```tsx
import AlertTriangle from 'reicon-react/icons/AlertTriangle';
import ArrowDoorOut from 'reicon-react/icons/ArrowDoorOut';
import ArrowSwapHorizontal from 'reicon-react/icons/ArrowSwapHorizontal';
import ArrowUpCircle from 'reicon-react/icons/ArrowUpCircle';
import ArrowUpRight from 'reicon-react/icons/ArrowUpRight';
import Award from 'reicon-react/icons/Award';
import AwardCertificate from 'reicon-react/icons/AwardCertificate';
import Banknote from 'reicon-react/icons/Banknote';
import Bed from 'reicon-react/icons/Bed';
import Bell from 'reicon-react/icons/Bell';
import Book from 'reicon-react/icons/Book';
import BookBookmark from 'reicon-react/icons/BookBookmark';
import BookOpen from 'reicon-react/icons/BookOpen';
import Box from 'reicon-react/icons/Box';
import Briefcase from 'reicon-react/icons/Briefcase';
import Building from 'reicon-react/icons/Building';
import Buildings from 'reicon-react/icons/Buildings';
import Bus from 'reicon-react/icons/Bus';
import Calendar from 'reicon-react/icons/Calendar';
import CalendarCheck from 'reicon-react/icons/CalendarCheck';
import CalendarDays from 'reicon-react/icons/CalendarDays';
import CalendarMark from 'reicon-react/icons/CalendarMark';
import CalendarMinus from 'reicon-react/icons/CalendarMinus';
import Camera from 'reicon-react/icons/Camera';
import Car from 'reicon-react/icons/Car';
import CartAdd from 'reicon-react/icons/CartAdd';
import Chalkboard from 'reicon-react/icons/Chalkboard';
import ChartBar from 'reicon-react/icons/ChartBar';
import ChartPie from 'reicon-react/icons/ChartPie';
import ChartSuccess from 'reicon-react/icons/ChartSuccess';
import CheckCircle from 'reicon-react/icons/CheckCircle';
import CheckSquare from 'reicon-react/icons/CheckSquare';
import ClipboardCheck from 'reicon-react/icons/ClipboardCheck';
import ClipboardText from 'reicon-react/icons/ClipboardText';
import ColorSwatch from 'reicon-react/icons/ColorSwatch';
import Copy from 'reicon-react/icons/Copy';
import CreditCard from 'reicon-react/icons/CreditCard';
import DarkLight from 'reicon-react/icons/DarkLight';
import Database from 'reicon-react/icons/Database';
import Devices from 'reicon-react/icons/Devices';
import Diploma from 'reicon-react/icons/Diploma';
import Download from 'reicon-react/icons/Download';
import Edit from 'reicon-react/icons/Edit';
import Envelope from 'reicon-react/icons/Envelope';
import Export from 'reicon-react/icons/Export';
import Eye from 'reicon-react/icons/Eye';
import FileStar from 'reicon-react/icons/FileStar';
import Filter from 'reicon-react/icons/Filter';
import Fingerprint from 'reicon-react/icons/Fingerprint';
import FolderOpen from 'reicon-react/icons/FolderOpen';
import GraduationCap from 'reicon-react/icons/GraduationCap';
import Handshake from 'reicon-react/icons/Handshake';
import Help from 'reicon-react/icons/Help';
import History from 'reicon-react/icons/History';
import Home from 'reicon-react/icons/Home';
import Hourglass from 'reicon-react/icons/Hourglass';
import Import from 'reicon-react/icons/Import';
import InfoCircle from 'reicon-react/icons/InfoCircle';
import Invoice from 'reicon-react/icons/Invoice';
import Key from 'reicon-react/icons/Key';
import Keyboard from 'reicon-react/icons/Keyboard';
import Language from 'reicon-react/icons/Language';
import Layers from 'reicon-react/icons/Layers';
import Layout from 'reicon-react/icons/Layout';
import Library from 'reicon-react/icons/Library';
import Lifebuoy from 'reicon-react/icons/Lifebuoy';
import Link from 'reicon-react/icons/Link';
import ListCheck from 'reicon-react/icons/ListCheck';
import Location from 'reicon-react/icons/Location';
import Lock from 'reicon-react/icons/Lock';
import Login from 'reicon-react/icons/Login';
import Logout from 'reicon-react/icons/Logout';
import MapPoint from 'reicon-react/icons/MapPoint';
import Medal from 'reicon-react/icons/Medal';
import Menu from 'reicon-react/icons/Menu';
import Messages from 'reicon-react/icons/Messages';
import Mobile from 'reicon-react/icons/Mobile';
import MoneyReceive from 'reicon-react/icons/MoneyReceive';
import MoneySend from 'reicon-react/icons/MoneySend';
import MoneyStack from 'reicon-react/icons/MoneyStack';
import MoneyTime from 'reicon-react/icons/MoneyTime';
import Moon from 'reicon-react/icons/Moon';
import MoreH from 'reicon-react/icons/MoreH';
import Notebook from 'reicon-react/icons/Notebook';
import Paperclip from 'reicon-react/icons/Paperclip';
import PenWriting from 'reicon-react/icons/PenWriting';
import PercentTag from 'reicon-react/icons/PercentTag';
import Phone from 'reicon-react/icons/Phone';
import Plug from 'reicon-react/icons/Plug';
import Plus from 'reicon-react/icons/Plus';
import Printer from 'reicon-react/icons/Printer';
import Qr from 'reicon-react/icons/Qr';
import Receipt from 'reicon-react/icons/Receipt';
import ReceiptText from 'reicon-react/icons/ReceiptText';
import Refresh from 'reicon-react/icons/Refresh';
import Route from 'reicon-react/icons/Route';
import Scale from 'reicon-react/icons/Scale';
import ScanBarcode from 'reicon-react/icons/ScanBarcode';
import Search from 'reicon-react/icons/Search';
import Send from 'reicon-react/icons/Send';
import Setting2 from 'reicon-react/icons/Setting2';
import Settings from 'reicon-react/icons/Settings';
import ShieldAlert from 'reicon-react/icons/ShieldAlert';
import ShieldCheck from 'reicon-react/icons/ShieldCheck';
import Sitemap from 'reicon-react/icons/Sitemap';
import Sms from 'reicon-react/icons/Sms';
import Sparkles from 'reicon-react/icons/Sparkles';
import Speaker from 'reicon-react/icons/Speaker';
import Star from 'reicon-react/icons/Star';
import Sun2 from 'reicon-react/icons/Sun2';
import Task from 'reicon-react/icons/Task';
import Trash from 'reicon-react/icons/Trash';
import TrendDown from 'reicon-react/icons/TrendDown';
import TrendUp from 'reicon-react/icons/TrendUp';
import Umbrella from 'reicon-react/icons/Umbrella';
import Upload from 'reicon-react/icons/Upload';
import UserAdd from 'reicon-react/icons/UserAdd';
import UserCircle from 'reicon-react/icons/UserCircle';
import UserHeart from 'reicon-react/icons/UserHeart';
import UserId from 'reicon-react/icons/UserId';
import Users from 'reicon-react/icons/Users';
import UserTag from 'reicon-react/icons/UserTag';
import Video from 'reicon-react/icons/Video';
import Wallet from 'reicon-react/icons/Wallet';
import Warehouse from 'reicon-react/icons/Warehouse';
import WifiOff from 'reicon-react/icons/WifiOff';
import XCircle from 'reicon-react/icons/XCircle';
import type { IconComponent } from 'reicon-react/createIcon';

export const icons = {
  dashboard: Home,
  organization: Sitemap,
  school: Building,
  branch: Buildings,
  academicYear: CalendarCheck,
  students: GraduationCap,
  admissions: UserAdd,
  guardians: UserHeart,
  idCard: UserId,
  documents: FolderOpen,
  certificate: AwardCertificate,
  promote: ArrowUpCircle,
  transfer: ArrowDoorOut,
  alumni: Award,
  staff: Briefcase,
  leave: CalendarMinus,
  payroll: MoneyStack,
  payslip: ReceiptText,
  appraisal: ChartSuccess,
  academics: Chalkboard,
  classes: Layers,
  subjects: BookBookmark,
  curriculum: ListCheck,
  lessonPlans: Notebook,
  timetable: CalendarDays,
  substitution: ArrowSwapHorizontal,
  attendance: ClipboardCheck,
  qrAttendance: Qr,
  biometric: Fingerprint,
  exams: ClipboardText,
  marksEntry: PenWriting,
  grading: Scale,
  reportCard: FileStar,
  transcript: Diploma,
  homework: Task,
  evaluate: CheckSquare,
  fees: Wallet,
  invoice: Invoice,
  collectPayment: MoneyReceive,
  receipt: Receipt,
  concession: PercentTag,
  scholarship: Medal,
  refund: MoneySend,
  dues: MoneyTime,
  cash: Banknote,
  onlinePayment: CreditCard,
  financeReports: ChartPie,
  announcements: Speaker,
  messages: Messages,
  notifications: Bell,
  email: Envelope,
  sms: Sms,
  push: Mobile,
  ptm: Handshake,
  onlineMeeting: Video,
  library: Library,
  book: Book,
  loans: BookOpen,
  scanBarcode: ScanBarcode,
  overdue: Hourglass,
  transport: Bus,
  vehicle: Car,
  route: Route,
  stop: Location,
  liveTracking: MapPoint,
  hostel: Bed,
  inventory: Box,
  store: Warehouse,
  purchaseRequest: CartAdd,
  calendar: Calendar,
  event: CalendarMark,
  holiday: Umbrella,
  reports: ChartBar,
  trendUp: TrendUp,
  trendDown: TrendDown,
  aiInsights: Sparkles,
  atRisk: ShieldAlert,
  settings: Settings,
  tablePreferences: Setting2,
  users: Users,
  roles: ShieldCheck,
  switchRole: UserTag,
  auditLog: History,
  import: Import,
  export: Export,
  download: Download,
  upload: Upload,
  backups: Database,
  integrations: Plug,
  security: Lock,
  password: Key,
  sessions: Devices,
  language: Language,
  themeToggle: DarkLight,
  darkMode: Moon,
  lightMode: Sun2,
  density: Layout,
  branding: ColorSwatch,
  profile: UserCircle,
  signIn: Login,
  signOut: Logout,
  help: Help,
  support: Lifebuoy,
  shortcuts: Keyboard,
  search: Search,
  filter: Filter,
  add: Plus,
  edit: Edit,
  delete: Trash,
  view: Eye,
  print: Printer,
  copy: Copy,
  link: Link,
  external: ArrowUpRight,
  refresh: Refresh,
  send: Send,
  attach: Paperclip,
  camera: Camera,
  phone: Phone,
  more: MoreH,
  menu: Menu,
  favorite: Star,
  offline: WifiOff,
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: InfoCircle,
} satisfies Record<string, IconComponent>;

export type IconKey = keyof typeof icons;

// Wrapped in a span because Cloudscape forces stroke styles onto a root <svg>, and Reicon glyphs are filled paths.
export function svg(key: IconKey, filled = false) {
  const Glyph = icons[key];
  return (
    <span className="vw-icon">
      <Glyph size="100%" weight={filled ? 'Filled' : 'Outline'} aria-hidden="true" focusable="false" />
    </span>
  );
}
```

`.vw-icon` in `src/styles/global.css` is `display: block; inline-size: 100%; block-size: 100%;`. That is the only icon CSS in the app.

## 3. Usage patterns

### Button (with text)
```tsx
<Button iconSvg={svg('collectPayment')} variant="primary" onClick={collect}>Collect payment</Button>
```

### Icon-only button
```tsx
<Button iconSvg={svg('print')} variant="icon" ariaLabel="Print receipt RCPT/2026-27/000871" onClick={print} />
```

### ButtonDropdown items
```tsx
<ButtonDropdown
  items={[
    { id: 'print', text: 'Print receipt', iconSvg: svg('print') },
    { id: 'email', text: 'Email receipt', iconSvg: svg('email') },
    { id: 'refund', text: 'Request refund', iconSvg: svg('refund') },
  ]}
>
  Actions
</ButtonDropdown>
```

### SideNavigation (Filled for the active item)
```tsx
const link = (text: string, href: string, key: IconKey): SideNavigationProps.Link => ({
  type: 'link',
  text,
  href,
  icon: <Icon size="medium" svg={svg(key, pathname.startsWith(href))} />,
});
```

### Standalone Icon with meaning
```tsx
<Icon svg={svg('atRisk', true)} variant="warning" ariaLabel="At risk" />
```

### Empty state (48px)
```tsx
<Box textAlign="center" color="text-body-secondary">
  <Icon size="large" svg={svg('homework')} />
  <Box variant="h3">No homework due</Box>
  <Box variant="p">Homework your teachers set appears here.</Box>
</Box>
```

### TopNavigation utility
```tsx
{ type: 'button', iconSvg: svg('notifications'), ariaLabel: `Notifications, ${unread} unread`, badge: unread > 0, onClick: openDrawer }
```

### AppLayout drawer
```tsx
{ id: 'help', ariaLabels: { drawerName: 'Help', triggerButton: 'Open help' }, trigger: { iconSvg: svg('help') }, content: <HelpPanel /> }
```

## 4. Cloudscape's internal glyphs

Some Cloudscape components draw their own glyphs (StatusIndicator, Alert, Flashbar, input search magnifier, modal close, dropdown carets, sort arrows). App code never names these. `src/app/providers.tsx` remaps the semantic ones to Reicon once through `IconProvider`, so the whole UI reads as one icon family:

```tsx
<IconProvider
  icons={{
    search: svg('search'),
    notification: svg('notifications'),
    settings: svg('tablePreferences'),
    'user-profile': svg('profile'),
    calendar: svg('calendar'),
    filter: svg('filter'),
    edit: svg('edit'),
    download: svg('download'),
    upload: svg('upload'),
    copy: svg('copy'),
    external: svg('external'),
    menu: svg('menu'),
    'sign-out': svg('signOut'),
    'status-positive': svg('success'),
    'status-negative': svg('error'),
    'status-warning': svg('warning'),
    'status-info': svg('info'),
  }}
>
```

These keys are the **only** place Cloudscape icon names appear in Vidyawan, and only as override keys, never as `iconName`. Component chrome (carets, angles, close ×, sort indicators, drag handles, resize handles, the calendar grid arrows) stays on Cloudscape's glyphs. They are tuned to their component mechanics, and swapping them adds risk without helping users. See [ADR-004](23-decision-log.md#adr-004-reicon-over-cloudscape-built-in-icons).

## 5. Complete icon map

Key = the key in `icons.tsx`. Component = the Reicon component. Default size is 16px unless stated.

### Navigation and shell

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Dashboard / Home | `dashboard` | `Home` | Side nav first item (20px) for every role, breadcrumb root |
| Organization | `organization` | `Sitemap` | Super Admin nav: Organizations |
| School | `school` | `Building` | Super Admin nav: Schools, the school switcher in the top nav |
| Branch | `branch` | `Buildings` | Settings → Branches, the branch filter token |
| Search | `search` | `Search` | Global search in the top nav, table filters (through IconProvider) |
| Notifications | `notifications` | `Bell` | Top nav utility, Notifications drawer, notification preferences |
| Messages | `messages` | `Messages` | Side nav: Messages; "Message teacher" and "Message parent" buttons |
| Help | `help` | `Help` | Help drawer trigger, info links |
| Support | `support` | `Lifebuoy` | Top nav profile menu → "Contact support" |
| Keyboard shortcuts | `shortcuts` | `Keyboard` | Profile menu → "Keyboard shortcuts" |
| Profile | `profile` | `UserCircle` | Top nav profile menu trigger, "My profile" |
| Switch role | `switchRole` | `UserTag` | Top nav role switcher for multi-role users |
| Sign in / out | `signIn` / `signOut` | `Login` / `Logout` | Sign-in button, profile menu → "Sign out" |
| Language | `language` | `Language` | Profile menu and sign-in page language selector |
| Mode toggle | `themeToggle` | `DarkLight` | Top nav mode toggle (same icon in both modes, turned 180° in dark mode; the label says which mode it switches to) |
| Dark / light mode | `darkMode` / `lightMode` | `Moon` / `Sun2` | Profile menu → Appearance segmented control |
| Density | `density` | `Layout` | Profile menu → Density (comfortable/compact) |
| Menu | `menu` | `Menu` | Mobile nav toggle (through IconProvider) |
| More actions | `more` | `MoreH` | Icon-only row action menus in tables and cards |
| Offline | `offline` | `WifiOff` | PWA offline banner, "Saved on this device" status |

### Students and admissions

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Students | `students` | `GraduationCap` | Side nav: Students (20px); the parent child switcher; student empty states (48px) |
| Admissions | `admissions` | `UserAdd` | Side nav: Admissions; "New enquiry" button; admissions empty state |
| Guardians / Parents | `guardians` | `UserHeart` | Student profile → Guardians tab; "Add guardian" |
| ID card | `idCard` | `UserId` | "Print ID card" action; staff and student ID card preview |
| Documents | `documents` | `FolderOpen` | Documents tab on student, staff and admission records |
| Attachment | `attach` | `Paperclip` | File upload triggers in homework, messages and announcements |
| Certificate (TC, bonafide) | `certificate` | `AwardCertificate` | Student → Actions → "Issue certificate" |
| Promote | `promote` | `ArrowUpCircle` | Year-end promotion wizard, "Promote selected" bulk action |
| Transfer | `transfer` | `ArrowDoorOut` | Student → Actions → "Transfer out" |
| Alumni | `alumni` | `Award` | Side nav: Students → Alumni |
| Camera | `camera` | `Camera` | Student photo capture, homework "Take photo" |

### Staff and HR

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Staff | `staff` | `Briefcase` | Side nav: Staff; staff empty states |
| Leave | `leave` | `CalendarMinus` | Side nav: Leave; "Apply for leave"; leave approvals in the principal's attention list |
| Payroll | `payroll` | `MoneyStack` | Side nav: Payroll; "Run payroll" |
| Payslip | `payslip` | `ReceiptText` | Staff self-service → Payslips; "Download payslip" |
| Appraisal | `appraisal` | `ChartSuccess` | Side nav: Appraisals |
| Biometric check-in | `biometric` | `Fingerprint` | Staff attendance source column; Settings → Devices |

### Academics

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Academics | `academics` | `Chalkboard` | Side nav section: Academics (20px) |
| Classes and sections | `classes` | `Layers` | Academics → Classes and sections |
| Subjects | `subjects` | `BookBookmark` | Academics → Subjects |
| Curriculum | `curriculum` | `ListCheck` | Subject → Curriculum tab, syllabus coverage |
| Lesson plans | `lessonPlans` | `Notebook` | Teacher nav: Lesson plans |
| Timetable | `timetable` | `CalendarDays` | Side nav: Timetable; student and parent "Today" timetable card |
| Substitution | `substitution` | `ArrowSwapHorizontal` | Timetable → Substitutions; "Assign substitute" |
| Academic year | `academicYear` | `CalendarCheck` | Settings → Academic years; the year selector in the top nav |

### Attendance

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Attendance | `attendance` | `ClipboardCheck` | Side nav: Attendance; "Take attendance" primary action on the teacher dashboard |
| QR attendance | `qrAttendance` | `Qr` | "Show QR" for student check-in; QR kiosk mode |
| Biometric | `biometric` | `Fingerprint` | Attendance source column; device settings |

### Examinations

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Exams | `exams` | `ClipboardText` | Side nav: Exams; the exam schedule list |
| Marks entry | `marksEntry` | `PenWriting` | "Enter marks" primary action; the teacher attention list |
| Grading scheme | `grading` | `Scale` | Exams → Grading schemes |
| Report card | `reportCard` | `FileStar` | "Generate report cards", "View report card" |
| Transcript | `transcript` | `Diploma` | Student → Actions → "Download transcript" |

### Homework

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Homework / assignment | `homework` | `Task` | Side nav: Homework; student "Due today" card; empty states |
| Evaluate | `evaluate` | `CheckSquare` | "Evaluate submissions" action |
| Submit | `upload` | `Upload` | Student "Submit" button |

### Fees and finance

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Fees | `fees` | `Wallet` | Side nav: Fees (20px); the parent dashboard fee card |
| Invoice | `invoice` | `Invoice` | Fees → Invoices; "View invoice" |
| Collect payment | `collectPayment` | `MoneyReceive` | Fee counter primary button; accountant dashboard |
| Online payment | `onlinePayment` | `CreditCard` | Parent "Pay now"; payment method column |
| Cash | `cash` | `Banknote` | Payment method column and selector |
| Receipt | `receipt` | `Receipt` | "Print receipt", Receipts list |
| Concession (discount) | `concession` | `PercentTag` | Fees → Discounts; concession lines on an invoice |
| Scholarship | `scholarship` | `Medal` | Fees → Scholarships; "Nominate for scholarship" |
| Refund | `refund` | `MoneySend` | "Request refund", refund approvals |
| Dues | `dues` | `MoneyTime` | Fees → Dues; "Send reminders"; overdue invoice badge (Filled) |
| Finance reports | `financeReports` | `ChartPie` | Fees → Reports |

### Communication

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Announcements and notices | `announcements` | `Speaker` | Side nav: Announcements; "New announcement"; dashboard announcements card |
| Messages | `messages` | `Messages` | See Navigation and shell |
| Notifications | `notifications` | `Bell` | See Navigation and shell |
| Email channel | `email` | `Envelope` | Channel checkboxes, delivery status, "Email receipt" |
| SMS channel | `sms` | `Sms` | Channel checkboxes, delivery status |
| Push channel | `push` | `Mobile` | Channel checkboxes, "Enable notifications on this device" |
| Send | `send` | `Send` | Send message, publish announcement |
| PTM | `ptm` | `Handshake` | Side nav: PTM; "Book a slot" |
| Online meeting | `onlineMeeting` | `Video` | The "Join meeting" link on an online PTM slot |
| Phone | `phone` | `Phone` | Guardian contact rows (a `tel:` link) |

### Library, transport, hostel and inventory

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Library | `library` | `Library` | Side nav: Library |
| Book (title) | `book` | `Book` | Catalogue list and detail |
| Loans (circulation) | `loans` | `BookOpen` | Library → Circulation; "Issue", "Return" |
| Scan barcode | `scanBarcode` | `ScanBarcode` | The circulation scan input's leading button |
| Overdue | `overdue` | `Hourglass` | Overdue loans; any non-fee overdue badge (Filled) |
| Transport | `transport` | `Bus` | Side nav: Transport; the student profile transport card |
| Vehicle | `vehicle` | `Car` | Transport → Vehicles |
| Route | `route` | `Route` | Transport → Routes; "Notify route" |
| Stop | `stop` | `Location` | Stops list, the stop field on transport assignments |
| Live tracking (v2) | `liveTracking` | `MapPoint` | "Track bus" for parents |
| Hostel | `hostel` | `Bed` | Side nav: Hostel; rooms and allocations |
| Inventory | `inventory` | `Box` | Side nav: Inventory |
| Store | `store` | `Warehouse` | Inventory → Stores |
| Purchase request | `purchaseRequest` | `CartAdd` | "Request items" |

### Calendar, insights and reports

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Calendar | `calendar` | `Calendar` | Side nav: Calendar; the date field (through IconProvider) |
| Event | `event` | `CalendarMark` | "New event", event list |
| Holiday | `holiday` | `Umbrella` | Holiday list; the holiday marker on the attendance calendar |
| Reports | `reports` | `ChartBar` | Side nav: Reports |
| Trend up / down | `trendUp` / `trendDown` | `TrendUp` / `TrendDown` | Dashboard KPI deltas (always with text, e.g. "Up 3.2% from last week") |
| AI insights | `aiInsights` | `Sparkles` | Side nav: Insights; the "Why?" explanation popover header |
| At risk | `atRisk` | `ShieldAlert` | At-risk badge on a student (Filled, with `variant="warning"` + text) |

### Administration and settings

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Settings | `settings` | `Settings` | Side nav: Settings |
| Users | `users` | `Users` | Settings → Users |
| Roles and permissions | `roles` | `ShieldCheck` | Settings → Roles; the permission matrix view |
| Audit log | `auditLog` | `History` | Settings → Audit log; the "History" tab on records |
| Import / Export | `import` / `export` | `Import` / `Export` | Settings → Data import; the "Export" button on every table |
| Download / Upload | `download` / `upload` | `Download` / `Upload` | File downloads (PDF, CSV) and uploads |
| Backups | `backups` | `Database` | Super Admin → Backups |
| Integrations | `integrations` | `Plug` | Settings → Integrations (payment, SMS, email) |
| Security | `security` | `Lock` | Profile → Security (2FA) |
| Password | `password` | `Key` | "Change password", "Reset password" |
| Sessions and devices | `sessions` | `Devices` | Profile → Security → Active sessions |
| Branding | `branding` | `ColorSwatch` | Settings → School profile → Branding |

### Generic actions and status

| Concept | Key | Component | Where it is used |
|---|---|---|---|
| Add / create | `add` | `Plus` | Secondary "Add" buttons (primary create buttons are text-only) |
| Edit | `edit` | `Edit` | Row and header "Edit" |
| Delete | `delete` | `Trash` | Destructive actions (always followed by a confirmation modal) |
| View | `view` | `Eye` | "View" and "Preview" |
| Print | `print` | `Printer` | Receipts, report cards, ID cards |
| Copy | `copy` | `Copy` | Copy admission number or invite link (via Cloudscape `CopyToClipboard`) |
| Link | `link` | `Link` | "Copy link" |
| External link | `external` | `ArrowUpRight` | Links that open a new tab |
| Refresh | `refresh` | `Refresh` | Table refresh buttons, "Retry" in error states |
| Table preferences | `tablePreferences` | `Setting2` | The preferences trigger on every table (through IconProvider) |
| Favorite | `favorite` | `Star` | Pinned reports and saved filters (Filled when pinned) |
| Success / error / warning / info | `success` / `error` / `warning` / `info` | `CheckCircle` / `XCircle` / `AlertTriangle` / `InfoCircle` | Only through IconProvider for status components. Never used alone. |

## 6. Review checklist

- [ ] No `iconName=` and no `from 'reicon-react'` outside `src/components/icons.tsx` (lint rule `no-restricted-imports` + `no-restricted-syntax`; see [17-coding-standards.md](17-coding-standards.md#icons)).
- [ ] The concept already has a key. If not, add it here and in `icons.tsx` in the same PR.
- [ ] Icon-only buttons have a specific `ariaLabel` ("Print receipt RCPT/2026-27/000871", not "Print").
- [ ] Filled is used only for active, selected or status emphasis.
- [ ] No `color` prop and no hex values.
- [ ] Status uses `StatusIndicator` with text.
