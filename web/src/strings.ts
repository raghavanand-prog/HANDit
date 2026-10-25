// Every user-facing string lives here.
import type { ErrorCode, NoticeCode } from "./core/codes";

export const strings = {
  appName: "HANDit",
  pitch:
    "Send photos, videos and files from any phone or computer to any other — just open the link and scan the code. Original quality, never compressed, never uploaded.",
  auditLabel: "Public test — not independently security-audited",
  pathLabel: "Direct · Browser to browser · Encrypted",
  nameNotVerified: "name not verified",
  skipToContent: "Skip to content",
  backHome: "Home",
  cancel: "Cancel",
  close: "Close",
  done: "Done",
  details: "Details",
  help: "Help",

  nav: {
    settings: "Settings",
    howItWorks: "How it works",
    privacy: "Privacy",
    help: "Help",
    about: "About",
    feedback: "Feedback",
  },

  home: {
    badge: "Free · Nothing to install · No account needed",
    headline: "Hand your files to any device.",
    lead: "Photos, videos and files between any phone or computer. Scan a code, tap accept. Original quality, never uploaded.",
    send: "Send files",
    sendHint: "Pick files, then show a code for the other device to scan.",
    receive: "Receive files",
    receiveHint: "Show a code here and scan it with the phone that has the files.",
    laptopTip:
      "Between two laptops? Show a code on one, then scan it with the other's camera, or use Copy link.",
    sceneLabel:
      "A laptop sending photos, a video and a document straight to a phone, locked in between",
    chips: ["Original quality", "Direct and encrypted", "Nothing is uploaded"],
    whyTitle: "Made to be trusted",
    why: [
      {
        title: "Original quality. Proven.",
        text: "Nothing is compressed, resized or converted. Every file is fingerprinted on both devices, and the badge appears only when every one matches.",
      },
      {
        title: "Straight from one to the other.",
        text: "Files travel directly from one browser to the other, encrypted. HANDit's server only makes the introduction and can't read it.",
      },
      {
        title: "Nothing to install.",
        text: "It's a web page. Open it on an iPhone, an Android phone, Windows, Mac, Linux or a Chromebook, with no app and no sign-up.",
      },
    ],
    stepsTitle: "Three steps. That's it.",
    steps: [
      {
        title: "Show a code",
        text: "Pick your files and a one-time QR code appears. It works once and expires in two minutes.",
      },
      {
        title: "Scan it",
        text: "Point the other device's camera at it. No app needed, the camera app opens the link.",
      },
      {
        title: "Accept",
        text: "The other person sees what's coming and taps Accept. The files arrive identical, and HANDit proves it.",
      },
    ],
    platformsTitle: "Works on everything you own.",
    platforms: ["iPhone", "Android", "Windows", "Mac", "Linux", "Chromebook"],
  },

  send: {
    title: "Send files",
    dropTitle: "Drop files or folders here",
    dropHint: "Or choose them from this device. Nothing is converted or compressed.",
    chooseFiles: "Choose files",
    chooseFolder: "Choose a folder",
    remove: (name: string) => `Remove ${name}`,
    clear: "Clear all",
    totals: (count: number, size: string) => `${count} ${count === 1 ? "item" : "items"} · ${size}`,
    showCode: "Show code",
    sendTo: "Send to this device",
    sendToHint: "Pick the files to send. The other device will see the list and accept them first.",
    sendNow: "Send",
    reading: "Reading the folder…",
    emptyFolder: "empty folder",
  },

  code: {
    scanToReceive: "Scan with your phone's camera",
    scanToSend: "Scan this with the phone that has the files",
    worksOnce: "Works once",
    expiresIn: (time: string) => `Expires in ${time}`,
    secondsLeft: (n: number) => `${n} seconds left`,
    trust: "Only let people you trust scan this code.",
    copyLink: "Copy link",
    copied: "Link copied",
    copyFailed: "Couldn't copy. Select the link and copy it yourself.",
    linkLabel: "Link to this code",
    expired: "Code expired.",
    newCode: "Show new code",
    preparing: "Getting a code ready…",
    qrLabel: "QR code for the link",
  },

  signin: {
    title: "Welcome to HANDit",
    lead: "Sign in if you like. You never need an account to send or receive files.",
    github: "Continue with GitHub",
    google: "Continue with Google",
    guest: "Continue without an account",
    whatSaved: "What signing in does",
    points: [
      "Shows your name, and sets it as your device name so the other device sees who you are.",
      "Keeps one small cookie in this browser for 30 days. HANDit's server stores nothing about you: no email, no picture, no history.",
      "Your files never depend on it: they go straight between the two devices either way.",
    ],
    error:
      "Signing in didn't complete, and nothing was changed. Try again, or continue without an account.",
    unavailable:
      "Signing in isn't switched on right now. You can still send and receive as a guest.",
    signIn: "Sign in",
    signOut: "Sign out",
    signedInAs: (name: string) => `Signed in as ${name}`,
    via: (provider: string) => (provider === "github" ? "with GitHub" : "with Google"),
    account: "Account menu",
    welcomeBack: (name: string) => `Welcome back, ${name}`,
  },

  scan: {
    title: "Scan a code",
    hint: "Hold the other device's screen where this device's camera can see its code. Nothing is recorded or sent anywhere.",
    preview: "Camera preview",
    starting: "Starting the camera…",
    denied:
      "HANDit needs camera access to scan. Allow the camera for this site in your browser's settings, or ask the other device to use Copy link.",
    none: "No camera was found on this device. Ask the other device to use Copy link, or scan its code with a phone.",
    failed:
      "The camera couldn't start. Close other apps that use it and try again, or use Copy link.",
    stray: "That isn't a HANDit code. Point the camera at the code on the other device.",
    switchCamera: "Switch camera",
    link: "Scan a code with this device's camera",
  },

  join: {
    connecting: "Connecting…",
    connectingHint: "Setting up a direct, encrypted connection between the two devices.",
  },

  peer: {
    label: (name: string, ua: string) => `${name} (${ua.split(" on ")[0] ?? ua})`,
    joined: "joined",
    waitingAccept: "Waiting for them to accept…",
    choosing: "They're choosing files… (up to 3 minutes)",
    waitingSender: "Waiting for the sender…",
    confirmTitle: "Send to this device?",
    confirmHint: "Make sure this is the device you meant. Nobody else can join this code now.",
    allow: "Allow",
    dontAllow: "Don't allow",
  },

  review: {
    title: "Review files",
    from: "From",
    summary: (parts: string[]) => parts.join(" · "),
    photos: (n: number) => `${n} ${n === 1 ? "photo" : "photos"}`,
    videos: (n: number) => `${n} ${n === 1 ? "video" : "videos"}`,
    files: (n: number) => `${n} ${n === 1 ? "file" : "files"}`,
    folders: (n: number) => `${n} ${n === 1 ? "folder" : "folders"}`,
    topLevel: (name: string, files: number) =>
      `${name}/ — ${files} ${files === 1 ? "file" : "files"}`,
    more: (n: number) => `and ${n} more`,
    apps: (n: number) => `Contains apps or scripts (${n})`,
    appsHint: "Only open them if you trust the sender. HANDit never opens received files.",
    disguised: (n: number) => `Names that look like a different type (${n})`,
    disguisedHint: "A name like invoice.pdf.exe is a program pretending to be a document.",
    quality: "Original quality — files arrive exactly as sent",
    accept: "Accept",
    decline: "Decline",
    checkingStorage: "Checking browser storage…",
    countdown: (s: number) => `Decide within ${s} s, or the files are declined.`,
  },

  status: {
    preparing: "Getting ready",
    connecting: "Connecting",
    waitingForYou: "Waiting for you",
    waitingForThem: "Waiting for them",
    transferring: "Transferring",
    done: "Done",
    partial: "Finished with problems",
    failed: "Stopped",
    expired: "Code expired",
  },

  offline:
    "You're offline. HANDit needs the internet to start a transfer; files already received are kept.",

  route: {
    from: "From",
    to: "To",
    thisDevice: "This device",
    contents: "Contents",
    finishedAt: (time: string) => `Finished at ${time}`,
  },

  progress: {
    sending: (file: number, files: number) => `Sending ${file} of ${files}`,
    receiving: (file: number, files: number) => `Receiving ${file} of ${files}`,
    bytes: (done: string, total: string) => `${done} of ${total}`,
    left: (time: string) => `about ${time} left`,
    verifying: "Checking every file…",
  },

  complete: {
    sent: "Sent ✓ · Original quality",
    received: (count: number) => `Received ${count} ${count === 1 ? "item" : "items"}`,
    receivedMedia: (parts: string[]) => parts.join(" and "),
    badge: "Original quality · Identical ✓",
    partial: (ok: number, total: number, failed: number) =>
      `${ok} of ${total} identical · ${failed} failed`,
    save: "Save",
    saveEach: "Save files one by one",
    downloadAll: "Download all (.zip)",
    saveFolder: "Save to a folder…",
    share: "Save / Share",
    shareHint: "On a phone, choose Save to Photos or Save to Files.",
    saveError: "Couldn't save. Try another way below.",
    savedFolder: "Saved to the folder you chose.",
    fileOk: "Identical",
    fileFailed: "Not received",
    sendAgain: "Send again",
    newTransfer: "New transfer",
    blockedHint: "Browser blocked some downloads? Use Download all (.zip) instead.",
  },

  settings: {
    title: "Settings",
    intro: "Stored only in this browser.",
    name: "Device name",
    nameHint: "Shown to the other device, marked “name not verified”.",
    lifetime: "Code lifetime",
    minutes: (n: number) => `${n} ${n === 1 ? "minute" : "minutes"}`,
    confirm: "Confirm who receives",
    confirmHint:
      "When you send, check which device joined and tap Allow before the file list goes out.",
    saved: "Saved",
  },

  leave: "A transfer is in progress. Leave anyway?",

  errorParts: { what: "What happened", why: "Why", next: "What to do" },
  actions: {
    home: "Home",
    reload: "Reload",
    newCode: "Show new code",
    tryAgain: "Try again",
    help: "Help",
    sendAgain: "Send again",
    downloadAll: "Download all",
  },
};

export interface Message {
  what: string;
  why?: string;
  next?: string;
}

/** The three parts of every failure: what happened, why, what to do next. */
export const messages: Record<ErrorCode, Message> = {
  LINK_INVALID: {
    what: "This link doesn't work.",
    why: "It may be incomplete.",
    next: "Ask for a new code.",
  },
  LINK_UNSUPPORTED_VERSION: {
    what: "This code comes from a newer version of HANDit.",
    next: "Reload the page and try again.",
  },
  CODE_EXPIRED: {
    what: "This code has expired.",
    why: "Codes work for 2 minutes, unless the sender chose another time.",
    next: "Ask for a new one.",
  },
  CODE_ALREADY_USED: {
    what: "This code was already used by another device.",
    why: "Each code works once, for the first device that opens it.",
    next: "Ask for a new code.",
  },
  CODE_NOT_ACTIVE: {
    what: "This code isn't active anymore.",
    why: "It may have been cancelled, or its page was closed.",
    next: "Ask for a new one.",
  },
  SERVER_UNREACHABLE: {
    what: "Couldn't reach HANDit.",
    why: "This device may not be connected to the internet.",
    next: "Check that this device is connected to the internet, then try again.",
  },
  INTRO_TAMPERED: {
    what: "The connection couldn't be verified, so nothing was sent.",
    why: "Someone may be interfering.",
    next: "Try again with a new code.",
  },
  P2P_FAILED: {
    what: "These devices couldn't connect directly.",
    why: "This network may block direct connections — common on office, campus and some mobile networks, or with a VPN.",
    next: "Try the same Wi-Fi, or connect one device to the other's hotspot.",
  },
  PEER_LEFT: {
    what: "The other device left.",
    next: "Files that finished are saved; send the rest again.",
  },
  CONNECTION_LOST: {
    what: "Connection lost.",
    next: "Files that finished are saved; send the rest again.",
  },
  OFFER_DECLINED: { what: "The other device declined the files." },
  OFFER_TIMEOUT: { what: "No response, so nothing was sent." },
  CANCELLED_BY_PEER: { what: "The other device cancelled.", next: "Partial files were removed." },
  CANCELLED_BY_USER: { what: "Transfer cancelled.", next: "Partial files were removed." },
  STORAGE_TOO_SMALL: {
    what: "Not enough browser storage.",
    next: "Free up space on this device, or receive fewer files at once.",
  },
  STORAGE_FULL: {
    what: "Storage ran out.",
    why: "Files that finished are saved.",
    next: "Free up space, then send the rest again.",
  },
  DOWNLOAD_BLOCKED: {
    what: "Your browser blocked multiple downloads.",
    next: "Use Download all (.zip) instead, or allow downloads for this site.",
  },
  SOURCE_UNREADABLE: {
    what: "A file couldn't be read.",
    why: "It may have been moved or changed.",
    next: "It was skipped.",
  },
  INTEGRITY_FAILED: {
    what: "A file didn't arrive intact after 2 tries, so it wasn't saved.",
    next: "Try sending it again.",
  },
  LIMIT_EXCEEDED: {
    what: "This transfer has more than 10,000 items.",
    next: "Send it in parts.",
  },
  BROWSER_UNSUPPORTED: {
    what: "This browser can't run HANDit.",
    next: "Update it, or use a recent Chrome, Edge, Firefox or Safari.",
  },
  UNKNOWN_ERROR: {
    what: "Something went wrong.",
    next: "Try again with a new code.",
  },
};

/** Messages that depend on which side you're on, or on a name or size. */
export const messageText = {
  tooManyCodes: {
    what: "Too many codes were made from this network just now.",
    why: "To keep HANDit free for everyone, each network can make 100 codes and 300 join attempts every 10 minutes.",
    next: "Wait a few minutes, then try again.",
  },
  offerTimeoutRecipient: "No response — nothing was received.",
  storageTooSmall: (needed: string, available: string) =>
    `Not enough browser storage: needs ${needed}, ${available} available.`,
  sourceUnreadable: (name: string) =>
    `Couldn't read “${name}” — it may have been moved or changed. It was skipped.`,
  integrityFailed: (name: string) =>
    `“${name}” didn't arrive intact after 2 tries, so it wasn't saved. Try sending it again.`,
};

export const notices: Record<NoticeCode, string> = {
  QUALITY_IDENTICAL:
    "Every file is identical to the one sent — nothing was compressed or converted.",
  INFO_IPHONE_ORIGINALS:
    "To send original photos, tap Choose files, then Browse, and pick them from Files.",
  INFO_LOCATION_MAY_BE_HIDDEN:
    "Android may remove photo location before the browser gets the file. Everything else is sent exactly as is.",
  INFO_HEIC_ON_WINDOWS:
    "These photos are HEIC, the high-efficiency format used by iPhones and some Android phones. They're saved in original quality. To view them in Windows, install the HEIF Image Extension and HEVC Video Extensions from the Microsoft Store.",
  INFO_LINK_SHARING:
    "Anyone who opens this link first can receive the files. Send it only to the person you mean, and only through a chat you trust. It works once, for 2 minutes.",
};

/** The Copy link warning for a receive code: whoever opens it first can send files here. */
export const linkSharingReceive =
  "Anyone who opens this link first can send files to this device — you still review them before anything is saved. Share it only with the person you mean. It works once, for 2 minutes.";

/** Longer help for each message code, shown at /help/<CODE>. */
export const help: Partial<Record<ErrorCode, string[]>> = {
  CODE_EXPIRED: [
    "A code stops working after its lifetime (2 minutes unless changed in Settings), even if nobody used it. This keeps an old photo of a code from being useful to anyone.",
  ],
  CODE_ALREADY_USED: [
    "A code is used up by the first device that opens it, even before anyone accepts. If that wasn't the device you meant, the sender can cancel and show a new code.",
  ],
  SERVER_UNREACHABLE: [
    "Both devices need the internet to start, because HANDit's small introduction server connects them. The files themselves still go directly between the devices.",
  ],
  INTRO_TAMPERED: [
    "Every message used to introduce the two devices is sealed with a key that only the two devices know, from the code itself. A message that fails its seal check means it was changed on the way.",
    "Nothing was sent. If this keeps happening on one network, try another network.",
  ],
  P2P_FAILED: [
    "HANDit only sends files directly between the two devices — it never relays them through a server. Some networks block those direct connections.",
    "What usually works: put both devices on the same Wi-Fi, or turn on one phone's hotspot and connect the other device to it. Turning off a VPN can help too.",
    "Details shows which kinds of network addresses each device found: “local” means its address on this network, “public” its address on the internet.",
  ],
  PEER_LEFT: [
    "The other tab was closed or the device went to sleep. Keep both pages open, with the screen on, until the transfer finishes.",
  ],
  CONNECTION_LOST: [
    "No data arrived for 45 seconds. This happens when Wi-Fi drops, a phone locks its screen, or one device moves out of range.",
  ],
  STORAGE_TOO_SMALL: [
    "Received files are held in the browser's private storage until they're checked, then saved. The browser needs room for all the files plus a little extra.",
    "Free up space on this device, or ask the sender to send fewer files at once.",
  ],
  STORAGE_FULL: [
    "The browser's storage filled up while receiving. Files that finished and were verified are still there to save.",
  ],
  DOWNLOAD_BLOCKED: [
    "Browsers often ask before letting a site download several files at once. Download all (.zip) saves everything as one file instead. Files inside the .zip are stored without compression, so they stay identical.",
  ],
  INTEGRITY_FAILED: [
    "HANDit checks a SHA-256 fingerprint of every file. If a file doesn't match after two tries, it's deleted rather than saved, so you never keep a damaged copy.",
  ],
  BROWSER_UNSUPPORTED: [
    "HANDit needs direct browser connections (WebRTC), the browser's private storage and built-in encryption. Recent versions of Chrome, Edge, Firefox and Safari have all three.",
  ],
};

export const pages = {
  howItWorks: {
    title: "How it works",
    steps: [
      [
        "One device shows a code",
        "The code is a link with a one-time secret in it. The secret is in the part after #, which browsers never send to any server.",
      ],
      [
        "The other device scans it",
        "Use the phone's normal camera app. The page opens, reads the secret and removes it from the address bar.",
      ],
      [
        "A tiny server introduces the two",
        "Both devices meet in a short-lived “room” on HANDit's server. Everything they say there is sealed with a key made from the secret, so the server can't read it or change it without being caught.",
      ],
      [
        "The files go directly",
        "The devices open an encrypted WebRTC connection straight to each other and leave the room. The recipient sees the file list and taps Accept before anything is saved.",
      ],
      [
        "Every file is checked",
        "HANDit compares a SHA-256 fingerprint of every file on both sides. “Original quality · Identical ✓” appears only when every file matches.",
      ],
    ] as [string, string][],
    rules: [
      "A code works once, for one device, for 2 minutes by default.",
      "Nothing is compressed, resized or converted. Ever.",
      "HANDit never relays files through a server. If a network blocks direct connections, it says so instead.",
    ],
  },
  privacy: {
    title: "Privacy",
    points: [
      "No account is needed. Signing in is optional; if you choose to, one small cookie in your browser keeps your name and the provider (GitHub or Google) for 30 days. HANDit's server stores nothing about you: no email, no picture, no history.",
      "No analytics, ads or trackers.",
      "Your files go only to the other device, directly. They never pass through or stay on a server.",
      "The page talks only to HANDit's own server (for the page and the introduction) and to Cloudflare's STUN service, which tells a browser its public address.",
      "Links contain only a random secret, a mode and an expiry — no names, sizes or anything about you.",
      "Device names and file lists are shown only to the other device, and only after the seal check.",
      "This browser stores your settings and, if you sign in, that one cookie. Received files are held in its private storage until you save them, then deleted.",
      "The server keeps no logs of rooms, links or messages, and deletes each room when it ends.",
    ],
    ipTitle: "Your IP address",
    ip: "To connect directly, the other device learns your IP addresses. HANDit's server and Cloudflare's STUN service also see IP addresses and timing, but not your files, names or file list.",
    feedbackTitle: "Feedback",
    feedback:
      "Feedback is voluntary. Reports filed on GitHub are public; don't include personal files or details.",
  },
  limitations: {
    title: "Known limitations",
    items: [
      "Both devices need internet access to start a transfer; the files themselves go directly between the devices.",
      "Keep both browser tabs open, with the screen on, until the transfer finishes.",
      "Very large transfers are limited by the receiving browser's storage; HANDit checks before you accept.",
      "Some networks (strict office or campus firewalls, some mobile carriers, VPNs) block direct connections. Use the same Wi-Fi or a phone's hotspot.",
      "On iPhone, follow the tip on the Send screen to send original photos.",
      "Received files go to the browser's Downloads (or Files on iPhone), not straight into the photo gallery. On a phone, use Save / Share → Save to Photos.",
      "Between two laptops, use Copy link (or the in-page scanner, where a webcam is available).",
      "This public test has not been independently security-audited.",
    ],
  },
  about: {
    title: "About HANDit",
    body: [
      "HANDit sends photos, videos and files directly between any two devices — iPhone, Android, Windows, Mac, Linux — from the browser. Nothing to install, no account needed, nothing uploaded.",
      "It's open source, so anyone can check how it works.",
    ],
    source: "Source code on GitHub",
    credits: "Made by Raghav Anand.",
    officialTitle: "Check the address",
    official:
      "HANDit's only official address is the one shown in the project's README on GitHub. Don't scan codes on look-alike sites.",
  },
  feedback: {
    title: "Feedback",
    intro: "Testing HANDit? Tell us how it went — both the good and the bad help.",
    bug: "Report a problem",
    bugHint:
      "Which devices and browsers, the network, what happened, and the message code from Details.",
    worked: "It worked / it didn't",
    workedHint: "A 30-second report: which devices, and whether it worked.",
    public: "Reports on GitHub are public. Never attach personal files.",
  },
  help: {
    title: "Help",
    intro: "What each message means and what to do.",
    goodToKnow: "Good to know",
    notFound: "There's no help page for that.",
  },
  notFound: { title: "Page not found", body: "That page doesn't exist." },
};

export const REPOSITORY = "https://github.com/raghavanand-prog/HANDit";
