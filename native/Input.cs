// Keyboard and mouse-wheel input via SendInput.
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

        public static void Shutdown() { }
    }
}
