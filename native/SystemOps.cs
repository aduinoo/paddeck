// Screens, screenshot, lock, sleep, icon extraction and the tray icon.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace PadDeck
{
    static class SystemOps
    {
        [DllImport("user32.dll")] static extern bool LockWorkStation();
        [DllImport("powrprof.dll")] static extern bool SetSuspendState(bool hibernate, bool force, bool disableWake);
        [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        public static void InitDpi()
        {
            try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch { } }
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DEVMODE
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
            public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
            public int dmPositionX, dmPositionY; public int dmDisplayOrientation, dmDisplayFixedOutput;
            public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
            public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
            public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
        }
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettings(string name, int mode, ref DEVMODE dm);
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DISPLAY_DEVICE
        {
            public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString; public int StateFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        }
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string dev, int i, ref DISPLAY_DEVICE dd, int flags);

        // Physical-pixel desktop layout (independent of DPI scaling).
        public static object Screens()
        {
            var list = new List<object>();
            for (int i = 0; ; i++)
            {
                var dd = new DISPLAY_DEVICE(); dd.cb = Marshal.SizeOf(dd);
                if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
                if ((dd.StateFlags & 1) == 0) continue; // not attached to desktop
                var dm = new DEVMODE(); dm.dmSize = (short)Marshal.SizeOf(dm);
                if (!EnumDisplaySettings(dd.DeviceName, -1, ref dm)) continue;
                var mon = new DISPLAY_DEVICE(); mon.cb = Marshal.SizeOf(mon);
                string monName = EnumDisplayDevices(dd.DeviceName, 0, ref mon, 0) ? mon.DeviceString : dd.DeviceString;
                var d = new Dictionary<string, object>();
                d["index"] = list.Count; d["name"] = dd.DeviceName; d["monitor"] = monName; d["adapter"] = dd.DeviceString;
                d["primary"] = (dd.StateFlags & 4) != 0;
                d["x"] = dm.dmPositionX; d["y"] = dm.dmPositionY; d["width"] = dm.dmPelsWidth; d["height"] = dm.dmPelsHeight;
                d["refresh"] = dm.dmDisplayFrequency;
                list.Add(d);
            }
            return list;
        }

        // ShellExecute without any command-line parsing: file + args are passed separately.
        public static object ShellExecute(string file, string args, string verb, string cwd)
        {
            if (string.IsNullOrEmpty(file)) throw new Exception("Nothing to launch");
            var psi = new System.Diagnostics.ProcessStartInfo(file) { UseShellExecute = true };
            if (!string.IsNullOrEmpty(args)) psi.Arguments = args;
            if (!string.IsNullOrEmpty(verb)) psi.Verb = verb;
            if (!string.IsNullOrEmpty(cwd)) psi.WorkingDirectory = cwd;
            else if (File.Exists(file)) psi.WorkingDirectory = Path.GetDirectoryName(file);
            var p = System.Diagnostics.Process.Start(psi);
            return p != null ? (object)p.Id : true;
        }

        public static object Net()
        {
            long rx = 0, tx = 0; var names = new List<string>();
            foreach (var ni in System.Net.NetworkInformation.NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != System.Net.NetworkInformation.OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Loopback || ni.NetworkInterfaceType == System.Net.NetworkInformation.NetworkInterfaceType.Tunnel) continue;
                try { var s = ni.GetIPStatistics(); rx += s.BytesReceived; tx += s.BytesSent; names.Add(ni.Name); } catch { }
            }
            var d = new Dictionary<string, object>(); d["rx"] = rx; d["tx"] = tx; d["interfaces"] = names; return d;
        }

        public static object Drives()
        {
            var list = new List<object>();
            foreach (var di in DriveInfo.GetDrives())
            {
                try
                {
                    if (!di.IsReady || (di.DriveType != DriveType.Fixed && di.DriveType != DriveType.Removable)) continue;
                    var d = new Dictionary<string, object>();
                    d["name"] = di.Name.TrimEnd('\\'); d["label"] = di.VolumeLabel; d["total"] = di.TotalSize; d["free"] = di.TotalFreeSpace;
                    list.Add(d);
                }
                catch { }
            }
            return list;
        }

        public static object Lock() { if (!LockWorkStation()) throw new Exception("LockWorkStation failed"); return true; }

        public static object Sleep()
        {
            ThreadPool.QueueUserWorkItem(_ => { Thread.Sleep(500); SetSuspendState(false, false, false); });
            return true;
        }

        public static object Screenshot(string dir)
        {
            if (string.IsNullOrEmpty(dir)) dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "Screenshots");
            Directory.CreateDirectory(dir);
            var b = SystemInformation.VirtualScreen;
            string file = Path.Combine(dir, "PadDeck_" + DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss") + ".png");
            using (var bmp = new Bitmap(b.Width, b.Height))
            using (var g = Graphics.FromImage(bmp))
            {
                g.CopyFromScreen(b.X, b.Y, 0, 0, b.Size);
                bmp.Save(file, ImageFormat.Png);
                try { Clipboard_Set(bmp); } catch { }
            }
            return file;
        }

        static void Clipboard_Set(Image img)
        {
            var t = new Thread(() => { try { Clipboard.SetImage(img); } catch { } });
            t.SetApartmentState(ApartmentState.STA); t.Start(); t.Join(2000);
        }

        public static object Icon(string path, int size)
        {
            if (string.IsNullOrEmpty(path) || !File.Exists(path)) return null;
            using (var ico = System.Drawing.Icon.ExtractAssociatedIcon(path))
            {
                if (ico == null) return null;
                using (var bmp = ico.ToBitmap())
                using (var ms = new MemoryStream())
                {
                    bmp.Save(ms, ImageFormat.Png);
                    return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                }
            }
        }

        // ---------------- Shell item icons (works for Start-menu AppIDs, UWP apps, files) ----------------
        [ComImport, Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IShellItemImageFactory { [PreserveSig] int GetImage(SIZE size, int flags, out IntPtr hbmp); }
        [StructLayout(LayoutKind.Sequential)] struct SIZE { public int cx, cy; }
        [StructLayout(LayoutKind.Sequential)] struct BITMAP { public int bmType, bmWidth, bmHeight, bmWidthBytes; public short bmPlanes, bmBitsPixel; public IntPtr bmBits; }
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
        static extern void SHCreateItemFromParsingName(string path, IntPtr pbc, [MarshalAs(UnmanagedType.LPStruct)] Guid riid, [MarshalAs(UnmanagedType.Interface)] out IShellItemImageFactory item);
        [DllImport("gdi32.dll")] static extern int GetObject(IntPtr h, int size, ref BITMAP bmp);
        [DllImport("gdi32.dll")] static extern bool DeleteObject(IntPtr h);

        public static object ShellIcon(string parsingName, int size)
        {
            IShellItemImageFactory f;
            SHCreateItemFromParsingName(parsingName, IntPtr.Zero, typeof(IShellItemImageFactory).GUID, out f);
            IntPtr hbmp;
            int hr = f.GetImage(new SIZE { cx = size, cy = size }, 0x1 /*BIGGERSIZEOK*/ | 0x4 /*ICONONLY*/, out hbmp);
            Marshal.ReleaseComObject(f);
            if (hr < 0 || hbmp == IntPtr.Zero) return null;
            try
            {
                var bm = new BITMAP();
                GetObject(hbmp, Marshal.SizeOf(bm), ref bm);
                Bitmap result;
                if (bm.bmBitsPixel == 32 && bm.bmBits != IntPtr.Zero)
                {
                    using (var raw = new Bitmap(bm.bmWidth, bm.bmHeight, bm.bmWidthBytes, PixelFormat.Format32bppPArgb, bm.bmBits))
                    {
                        result = new Bitmap(bm.bmWidth, bm.bmHeight, PixelFormat.Format32bppArgb);
                        using (var g = Graphics.FromImage(result)) g.DrawImage(raw, 0, 0, bm.bmWidth, bm.bmHeight);
                    }
                    result.RotateFlip(RotateFlipType.RotateNoneFlipY); // DIB sections are bottom-up
                }
                else result = System.Drawing.Image.FromHbitmap(hbmp);
                using (result)
                using (var ms = new MemoryStream())
                {
                    result.Save(ms, ImageFormat.Png);
                    return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
                }
            }
            finally { DeleteObject(hbmp); }
        }

        // ---------------- Tray ----------------
        static NotifyIcon tray;
        static SynchronizationContext trayCtx;

        public static void StartTray(string title)
        {
            var ready = new ManualResetEvent(false);
            var t = new Thread(() =>
            {
                Application.EnableVisualStyles();
                var form = new Form { ShowInTaskbar = false, WindowState = FormWindowState.Minimized, FormBorderStyle = FormBorderStyle.FixedToolWindow, Opacity = 0 };
                form.Load += (s, e) => form.Hide();
                var _ = form.Handle;
                trayCtx = new WindowsFormsSynchronizationContext();
                SynchronizationContext.SetSynchronizationContext(trayCtx);
                tray = new NotifyIcon { Icon = MakeIcon(), Text = title, Visible = true };
                var menu = new ContextMenuStrip();
                menu.Items.Add("Open PadDeck settings", null, (s, e) => Program.Emit("tray", "settings"));
                menu.Items.Add("Show pairing QR code", null, (s, e) => Program.Emit("tray", "pair"));
                menu.Items.Add(new ToolStripSeparator());
                menu.Items.Add("Restart companion", null, (s, e) => Program.Emit("tray", "restart"));
                menu.Items.Add("Quit PadDeck", null, (s, e) => Program.Emit("tray", "quit"));
                tray.ContextMenuStrip = menu;
                tray.DoubleClick += (s, e) => Program.Emit("tray", "settings");
                ready.Set();
                Application.Run(form);
            });
            t.SetApartmentState(ApartmentState.STA);
            t.IsBackground = true;
            t.Start();
            ready.WaitOne(5000);
        }

        public static object Notify(string title, string text)
        {
            if (tray == null) return false;
            trayCtx.Post(_ => tray.ShowBalloonTip(4000, title, text, ToolTipIcon.Info), null);
            return true;
        }

        public static object SetTrayText(string text)
        {
            if (tray == null) return false;
            trayCtx.Post(_ => tray.Text = text.Length > 63 ? text.Substring(0, 63) : text, null);
            return true;
        }

        public static void HideTray() { if (tray != null) { try { tray.Visible = false; tray.Dispose(); } catch { } } }

        static Icon MakeIcon()
        {
            var bmp = new Bitmap(32, 32);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);
                using (var path = Rounded(new Rectangle(1, 1, 30, 30), 8))
                using (var br = new LinearGradientBrush(new Rectangle(0, 0, 32, 32), Color.FromArgb(124, 92, 255), Color.FromArgb(56, 189, 248), 45f))
                    g.FillPath(br, path);
                using (var w = new SolidBrush(Color.FromArgb(240, 255, 255, 255)))
                {
                    g.FillRectangle(w, 8, 8, 7, 7); g.FillRectangle(w, 17, 8, 7, 7);
                    g.FillRectangle(w, 8, 17, 7, 7); g.FillRectangle(w, 17, 17, 7, 7);
                }
            }
            return System.Drawing.Icon.FromHandle(bmp.GetHicon());
        }

        static GraphicsPath Rounded(Rectangle r, int rad)
        {
            var p = new GraphicsPath(); int d = rad * 2;
            p.AddArc(r.X, r.Y, d, d, 180, 90); p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90); p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure(); return p;
        }
    }
}
