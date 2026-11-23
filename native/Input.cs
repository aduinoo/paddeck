// Keyboard (SendInput) and synthetic pen/touch injection (InjectSyntheticPointerInput,
// Windows 10 1809+). Pen input is delivered to Windows as a real pen pointer with
// pressure, tilt, barrel button and eraser, so Windows Ink apps receive pen data.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace PadDeck
{
    static class Input
    {
        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr extra; }
        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT { public int dx; public int dy; public int mouseData; public uint dwFlags; public uint time; public IntPtr extra; }
        [StructLayout(LayoutKind.Explicit)]
        struct INPUT
        {
            [FieldOffset(0)] public uint type;
            [FieldOffset(8)] public KEYBDINPUT ki;
            [FieldOffset(8)] public MOUSEINPUT mi;
        }

        [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
        [DllImport("user32.dll")] static extern ushort MapVirtualKey(uint code, uint mapType);

        const uint KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2, KEYEVENTF_UNICODE = 4;

        static readonly Dictionary<string, ushort> Keys = BuildKeys();
        static readonly HashSet<ushort> Extended = new HashSet<ushort>(new ushort[] {
            0x21,0x22,0x23,0x24,0x25,0x26,0x27,0x28,0x2C,0x2D,0x2E,0x5B,0x5C,0x5D,0x6F,0x90,0xA3,0xA5,
            0xAD,0xAE,0xAF,0xB0,0xB1,0xB2,0xB3,0xA6,0xA7,0xA8,0xA9,0xAA,0xAB,0xAC });

        static Dictionary<string, ushort> BuildKeys()
        {
            var k = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase);
            for (char c = 'A'; c <= 'Z'; c++) k[c.ToString()] = (ushort)c;
            for (char c = '0'; c <= '9'; c++) k[c.ToString()] = (ushort)c;
            for (int i = 1; i <= 24; i++) k["F" + i] = (ushort)(0x6F + i);
            for (int i = 0; i <= 9; i++) k["num" + i] = (ushort)(0x60 + i);
            string[] names = { "ctrl","control","shift","alt","win","meta","cmd","rctrl","rshift","ralt","rwin",
                "enter","return","esc","escape","tab","space","backspace","delete","del","insert","ins","home","end",
                "pageup","pgup","pagedown","pgdn","up","down","left","right","printscreen","prtsc","capslock","numlock","scrolllock","pause","apps","menu",
                "plus","=","minus","-",",","comma",".","period","/","slash",";","semicolon","'","quote","[","]","\\","backslash","`","backquote",
                "numadd","numsub","nummul","numdiv","numdecimal",
                "volumemute","volumedown","volumeup","medianext","mediaprev","mediastop","mediaplaypause","browserback","browserforward","browserrefresh","browserhome" };
            ushort[] codes = { 0xA2,0xA2,0xA0,0xA4,0x5B,0x5B,0x5B,0xA3,0xA1,0xA5,0x5C,
                0x0D,0x0D,0x1B,0x1B,0x09,0x20,0x08,0x2E,0x2E,0x2D,0x2D,0x24,0x23,
                0x21,0x21,0x22,0x22,0x26,0x28,0x25,0x27,0x2C,0x2C,0x14,0x90,0x91,0x13,0x5D,0x5D,
                0xBB,0xBB,0xBD,0xBD,0xBC,0xBC,0xBE,0xBE,0xBF,0xBF,0xBA,0xBA,0xDE,0xDE,0xDB,0xDD,0xDC,0xDC,0xC0,0xC0,
                0x6B,0x6D,0x6A,0x6F,0x6E,
                0xAD,0xAE,0xAF,0xB0,0xB1,0xB2,0xB3,0xA6,0xA7,0xA8,0xAC };
            for (int i = 0; i < names.Length; i++) k[names[i]] = codes[i];
            return k;
        }

        public static ushort Vk(string name)
        {
            ushort v;
            if (Keys.TryGetValue(name.Trim(), out v)) return v;
            throw new Exception("Unknown key: " + name);
        }

        static INPUT Key(ushort vk, bool up)
        {
            var i = new INPUT { type = 1 };
            i.ki.wVk = vk;
            i.ki.wScan = MapVirtualKey(vk, 0);
            i.ki.dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (Extended.Contains(vk) ? KEYEVENTF_EXTENDEDKEY : 0);
            return i;
        }

        static void Send(List<INPUT> list)
        {
            if (list.Count == 0) return;
            uint sent = SendInput((uint)list.Count, list.ToArray(), Marshal.SizeOf(typeof(INPUT)));
            if (sent != list.Count) throw new Exception("SendInput blocked (error " + Marshal.GetLastWin32Error() + "). Input to elevated windows needs the companion to run as administrator.");
        }

        // keys: ["ctrl","shift","s"] - pressed in order, released in reverse.
        public static object Combo(IList<object> keys, int holdMs)
        {
            var vks = new List<ushort>();
            foreach (var k in keys) vks.Add(Vk(Convert.ToString(k)));
            var down = new List<INPUT>();
            foreach (var v in vks) down.Add(Key(v, false));
            Send(down);
            if (holdMs > 0) Thread.Sleep(holdMs);
            var up = new List<INPUT>();
            for (int i = vks.Count - 1; i >= 0; i--) up.Add(Key(vks[i], true));
            Send(up);
            return true;
        }

        public static object KeyState(string key, bool down)
        {
            Send(new List<INPUT> { Key(Vk(key), !down) });
            return true;
        }

        public static object Text(string text)
        {
            var list = new List<INPUT>();
            foreach (char c in text)
            {
                if (c == '\n') { list.Add(Key(0x0D, false)); list.Add(Key(0x0D, true)); continue; }
                var d = new INPUT { type = 1 }; d.ki.wScan = c; d.ki.dwFlags = KEYEVENTF_UNICODE;
                var u = new INPUT { type = 1 }; u.ki.wScan = c; u.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                list.Add(d); list.Add(u);
            }
            Send(list);
            return true;
        }

        public static object Scroll(int dy, int dx)
        {
            var list = new List<INPUT>();
            if (dy != 0) { var i = new INPUT { type = 0 }; i.mi.dwFlags = 0x0800; i.mi.mouseData = dy; list.Add(i); }
            if (dx != 0) { var i = new INPUT { type = 0 }; i.mi.dwFlags = 0x1000; i.mi.mouseData = dx; list.Add(i); }
            Send(list);
            return true;
        }

        // ---------------- Synthetic pointer (pen / touch) ----------------
        [StructLayout(LayoutKind.Sequential)] struct POINT { public int x; public int y; }
        [StructLayout(LayoutKind.Sequential)] struct RECT { public int l, t, r, b; }

        [StructLayout(LayoutKind.Sequential)]
        struct POINTER_INFO
        {
            public uint pointerType; public uint pointerId; public uint frameId; public uint pointerFlags;
            public IntPtr sourceDevice; public IntPtr hwndTarget;
            public POINT ptPixelLocation; public POINT ptHimetricLocation; public POINT ptPixelLocationRaw; public POINT ptHimetricLocationRaw;
            public uint dwTime; public uint historyCount; public int InputData; public uint dwKeyStates;
            public ulong PerformanceCount; public int ButtonChangeType;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct POINTER_PEN_INFO
        {
            public POINTER_INFO pointerInfo; public uint penFlags; public uint penMask;
            public uint pressure; public uint rotation; public int tiltX; public int tiltY;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct POINTER_TOUCH_INFO
        {
            public POINTER_INFO pointerInfo; public uint touchFlags; public uint touchMask;
            public RECT rcContact; public RECT rcContactRaw; public uint orientation; public uint pressure;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct POINTER_TYPE_INFO
        {
            [FieldOffset(0)] public uint type;
            [FieldOffset(8)] public POINTER_PEN_INFO pen;
            [FieldOffset(8)] public POINTER_TOUCH_INFO touch;
        }

        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr CreateSyntheticPointerDevice(uint type, uint maxCount, uint mode);
        [DllImport("user32.dll", SetLastError = true)] static extern bool InjectSyntheticPointerInput(IntPtr dev, [In] POINTER_TYPE_INFO[] info, uint count);
        [DllImport("user32.dll")] static extern void DestroySyntheticPointerDevice(IntPtr dev);
        [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
        // Synthetic pointer coordinates are relative to the virtual-desktop origin, which is
        // negative when a monitor sits left of / above the main display.
        static int VX(int x) { return x - GetSystemMetrics(76); }
        static int VY(int y) { return y - GetSystemMetrics(77); }

        const uint PT_TOUCH = 2, PT_PEN = 3;
        const uint F_NEW = 0x1, F_INRANGE = 0x2, F_INCONTACT = 0x4, F_FIRSTBUTTON = 0x10, F_SECONDBUTTON = 0x20,
            F_PRIMARY = 0x2000, F_CONFIDENCE = 0x4000, F_DOWN = 0x10000, F_UPDATE = 0x20000, F_UP = 0x40000;
        const uint PEN_BARREL = 1, PEN_INVERTED = 2, PEN_ERASER = 4;
        const uint PEN_MASK_PRESSURE = 1, PEN_MASK_ROTATION = 2, PEN_MASK_TILT_X = 4, PEN_MASK_TILT_Y = 8;

        static IntPtr penDev = IntPtr.Zero, touchDev = IntPtr.Zero;
        static bool penInContact = false, penInRange = false;
        static int lastX, lastY;

        static IntPtr PenDevice()
        {
            if (penDev == IntPtr.Zero)
            {
                penDev = CreateSyntheticPointerDevice(PT_PEN, 1, 1 /*POINTER_FEEDBACK_DEFAULT*/);
                if (penDev == IntPtr.Zero) throw new Exception("CreateSyntheticPointerDevice(pen) failed: " + Marshal.GetLastWin32Error());
                // Warm-up: Windows tends to drop the first frames from a brand-new synthetic device.
                var w = new POINTER_TYPE_INFO[1]; w[0].type = PT_PEN;
                var wp = new POINTER_PEN_INFO(); wp.pointerInfo.pointerType = PT_PEN; wp.pointerInfo.pointerFlags = F_UPDATE | F_PRIMARY;
                w[0].pen = wp;
                for (int i = 0; i < 3; i++) { InjectSyntheticPointerInput(penDev, w, 1); Thread.Sleep(15); }
            }
            return penDev;
        }

        // phase: "hover" | "down" | "move" | "up" | "leave"
        public static object Pen(string phase, int x, int y, double pressure, int tiltX, int tiltY, int rotation, bool barrel, bool eraser)
        {
            var dev = PenDevice();
            var info = new POINTER_TYPE_INFO[1];
            info[0].type = PT_PEN;
            var p = new POINTER_PEN_INFO();
            p.pointerInfo.pointerType = PT_PEN;
            p.pointerInfo.pointerId = 0;
            p.pointerInfo.ptPixelLocation.x = VX(x); p.pointerInfo.ptPixelLocation.y = VY(y);
            uint flags;
            switch (phase)
            {
                case "down": flags = F_INRANGE | F_INCONTACT | F_FIRSTBUTTON | F_DOWN | F_PRIMARY | F_CONFIDENCE; break;
                case "move": flags = F_INRANGE | F_INCONTACT | F_FIRSTBUTTON | F_UPDATE | F_PRIMARY | F_CONFIDENCE; break;
                case "up": flags = F_INRANGE | F_UP | F_PRIMARY | F_CONFIDENCE; break;
                case "leave": flags = F_UPDATE | F_PRIMARY; break;
                default: flags = F_INRANGE | F_UPDATE | F_PRIMARY | F_CONFIDENCE; break; // hover
            }
            // Never inject "move" without a prior "down" (Windows rejects the sequence).
            if (phase == "move" && !penInContact) { phase = "down"; flags = F_INRANGE | F_INCONTACT | F_FIRSTBUTTON | F_DOWN | F_PRIMARY | F_CONFIDENCE; }
            if (phase == "up" && !penInContact) return false;
            if (phase == "down" && penInContact) { flags = F_INRANGE | F_INCONTACT | F_FIRSTBUTTON | F_UPDATE | F_PRIMARY | F_CONFIDENCE; }
            if (phase == "leave" && penInContact) { Pen("up", lastX, lastY, 0, 0, 0, 0, false, false); }
            if (phase == "leave" && !penInRange) return false;
            if (barrel && (phase == "down" || phase == "move")) { flags |= F_SECONDBUTTON; }
            p.pointerInfo.pointerFlags = flags;
            p.penFlags = (barrel ? PEN_BARREL : 0) | (eraser ? (PEN_ERASER | PEN_INVERTED) : 0);
            p.penMask = PEN_MASK_PRESSURE | PEN_MASK_TILT_X | PEN_MASK_TILT_Y | PEN_MASK_ROTATION;
            p.pressure = (uint)Math.Max(0, Math.Min(1024, Math.Round(pressure * 1024)));
            if (phase != "down" && phase != "move") p.pressure = 0;
            p.tiltX = Math.Max(-90, Math.Min(90, tiltX));
            p.tiltY = Math.Max(-90, Math.Min(90, tiltY));
            p.rotation = (uint)(((rotation % 360) + 360) % 360);
            info[0].pen = p;
            if (!InjectSyntheticPointerInput(dev, info, 1))
            {
                int err = Marshal.GetLastWin32Error();
                // Reset state machine on failure so the next stroke starts clean.
                penInContact = false;
                throw new Exception("InjectSyntheticPointerInput(pen) failed: " + err);
            }
            lastX = x; lastY = y;
            penInContact = phase == "down" || phase == "move";
            penInRange = phase != "leave";
            return true;
        }

        static readonly Dictionary<int, bool> touchActive = new Dictionary<int, bool>();

        // contacts: [{id,x,y,phase}] phase down|move|up
        public static object Touch(IList<object> contacts)
        {
            if (touchDev == IntPtr.Zero)
            {
                touchDev = CreateSyntheticPointerDevice(PT_TOUCH, 10, 1);
                if (touchDev == IntPtr.Zero) throw new Exception("CreateSyntheticPointerDevice(touch) failed: " + Marshal.GetLastWin32Error());
            }
            var list = new List<POINTER_TYPE_INFO>();
            foreach (var o in contacts)
            {
                var c = (Dictionary<string, object>)o;
                int id = Convert.ToInt32(c["id"]) % 10;
                int x = Convert.ToInt32(c["x"]), y = Convert.ToInt32(c["y"]);
                string phase = Convert.ToString(c["phase"]);
                bool active = touchActive.ContainsKey(id);
                uint flags;
                if (phase == "down" || (phase == "move" && !active)) { flags = F_INRANGE | F_INCONTACT | F_DOWN | F_CONFIDENCE; touchActive[id] = true; }
                else if (phase == "move") flags = F_INRANGE | F_INCONTACT | F_UPDATE | F_CONFIDENCE;
                else { if (!active) continue; flags = F_UP; touchActive.Remove(id); }
                if (id == 0) flags |= F_PRIMARY;
                var t = new POINTER_TOUCH_INFO();
                t.pointerInfo.pointerType = PT_TOUCH; t.pointerInfo.pointerId = (uint)id; t.pointerInfo.pointerFlags = flags;
                t.pointerInfo.ptPixelLocation.x = VX(x); t.pointerInfo.ptPixelLocation.y = VY(y);
                t.touchMask = 1; // contact area
                t.rcContact.l = VX(x) - 2; t.rcContact.r = VX(x) + 2; t.rcContact.t = VY(y) - 2; t.rcContact.b = VY(y) + 2;
                var info = new POINTER_TYPE_INFO(); info.type = PT_TOUCH; info.touch = t;
                list.Add(info);
            }
            if (list.Count == 0) return false;
            if (!InjectSyntheticPointerInput(touchDev, list.ToArray(), (uint)list.Count))
            {
                touchActive.Clear();
                throw new Exception("InjectSyntheticPointerInput(touch) failed: " + Marshal.GetLastWin32Error());
            }
            return true;
        }

        public static void Shutdown()
        {
            if (penDev != IntPtr.Zero) { try { if (penInRange) Pen("leave", lastX, lastY, 0, 0, 0, 0, false, false); } catch { } DestroySyntheticPointerDevice(penDev); }
            if (touchDev != IntPtr.Zero) DestroySyntheticPointerDevice(touchDev);
        }
    }
}
