// Central icon registry — all UI icons sourced from lucide-react.
// Import from here, never directly from lucide-react, to keep sizes consistent.

import {
  FileText,
  Link,
  Palette,
  FolderOpen,
  ScanFace,
  Scissors,
  Droplets,
  Trash2,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  Search,
  Target,
  Eye,
  Star,
  Film,
  Lock,
  FileIcon,
  Package,
  Calendar,
  Camera,
  Telescope,
  Image,
  Rocket,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  ChevronRight,
  ChevronDown,
  Users,
  Settings,
  Upload,
  Download,
  Plus,
  Pencil,
  RefreshCw,
  Copy,
  QrCode,
  Shield,
  CreditCard,
  HardDrive,
  BarChart2,
  UserX,
  UserCheck,
  LogIn,
  Activity,
  Globe,
  Building2,
  Zap,
  UserPlus,
  MoreVertical,
  ArrowLeft,
  Menu,
  Home,
  Smartphone,
  Heart,
  LayoutGrid,
  Grid3x3,
  Rows3,
  LayoutDashboard,
} from "lucide-react";

// ─── Size constants ───────────────────────────────────────────────────────────

export const ICON_SM = 14;   // inline, badges, table cells
export const ICON_MD = 16;   // buttons, sidebar items
export const ICON_LG = 20;   // stat cards, section headers
export const ICON_XL = 24;   // empty states header
export const ICON_2XL = 48;  // empty state illustrations

// ─── Semantic icon aliases ────────────────────────────────────────────────────

export {
  // Settings sections
  FileText      as IconEventDetails,
  Link          as IconSharedLink,
  Palette       as IconGallery,
  FolderOpen    as IconGroups,
  ScanFace      as IconFaceDetection,
  Scissors      as IconCulling,
  Droplets      as IconWatermark,
  Trash2        as IconDanger,

  // Status / feedback
  AlertTriangle as IconWarning,
  Check         as IconCheck,
  X             as IconX,
  CheckCircle   as IconSuccess,
  XCircle       as IconError,
  AlertCircle   as IconAlert,
  Info          as IconInfo,

  // Feature icons
  Sparkles      as IconAI,
  Search        as IconSearch,
  Target        as IconTarget,
  Eye           as IconEye,
  Star          as IconStar,
  Film          as IconFilmstrip,
  Lock          as IconLock,
  FileIcon      as IconFile,
  Package       as IconPackage,
  Calendar      as IconCalendar,
  Camera        as IconCamera,
  Telescope     as IconLens,
  Image         as IconImage,
  Rocket        as IconLaunch,
  Shield        as IconShield,

  // Navigation & layout
  ChevronRight  as IconChevronRight,
  ChevronDown   as IconChevronDown,
  ArrowLeft     as IconArrowLeft,
  Menu          as IconMenu,
  Home          as IconHome,
  LayoutDashboard as IconDashboard,

  // Actions
  Settings      as IconSettings,
  Upload        as IconUpload,
  Download      as IconDownload,
  Plus          as IconPlus,
  Pencil        as IconEdit,
  RefreshCw     as IconRefresh,
  Copy          as IconCopy,
  Trash2        as IconTrash,
  MoreVertical  as IconMore,

  // Media / content
  QrCode        as IconQr,
  Smartphone    as IconMobile,
  Globe         as IconGlobe,
  Building2     as IconStudio,
  Zap           as IconZap,
  Heart         as IconHeart,

  // Grid densities
  LayoutGrid    as IconGridComfy,
  Grid3x3       as IconGridCompact,
  Rows3         as IconGridList,

  // Users & auth
  Users         as IconPeople,
  UserX         as IconUserRemove,
  UserCheck     as IconUserApprove,
  UserPlus      as IconUserAdd,
  LogIn         as IconLogin,

  // Billing / admin
  CreditCard    as IconBilling,
  HardDrive     as IconStorage,
  BarChart2     as IconStats,
  Activity      as IconActivity,
};

// ─── Semantic color classes ───────────────────────────────────────────────────

export const ICON_COLOR = {
  default:     "text-zinc-400 dark:text-zinc-500",
  primary:     "text-indigo-600 dark:text-indigo-400",
  success:     "text-emerald-600 dark:text-emerald-500",
  warning:     "text-amber-600 dark:text-amber-500",
  destructive: "text-red-600 dark:text-red-400",
  muted:       "text-zinc-300 dark:text-zinc-600",
} as const;
