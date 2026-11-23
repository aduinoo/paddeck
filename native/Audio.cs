// Windows Core Audio interop: endpoint enumeration, default device switching,
// endpoint volume/mute and per-application session volume.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace PadDeck
{
    [StructLayout(LayoutKind.Sequential)]
    struct PROPERTYKEY { public Guid fmtid; public int pid; public PROPERTYKEY(Guid g, int p) { fmtid = g; pid = p; } }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct PROPVARIANT { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        [PreserveSig] int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    }

    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int Item(int index, out IMMDevice device);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        [PreserveSig] int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
        [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore store);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, out PROPERTYKEY key);
        [PreserveSig] int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
    }

    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume
    {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr n);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr n);
        [PreserveSig] int GetChannelCount(out int c);
        [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid ctx);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
        [PreserveSig] int GetMasterVolumeLevel(out float db);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(int ch, float db, ref Guid ctx);
        [PreserveSig] int SetChannelVolumeLevelScalar(int ch, float level, ref Guid ctx);
        [PreserveSig] int GetChannelVolumeLevel(int ch, out float db);
        [PreserveSig] int GetChannelVolumeLevelScalar(int ch, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    [ComImport, Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioMeterInformation
    {
        [PreserveSig] int GetPeakValue(out float peak);
    }

    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2
    {
        [PreserveSig] int GetAudioSessionControl(IntPtr a, int b, out IntPtr c);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr a, int b, out IntPtr c);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator e);
    }

    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator
    {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl2 session);
    }

    [ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2
    {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName(string a, ref Guid b);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
        [PreserveSig] int SetIconPath(string a, ref Guid b);
        [PreserveSig] int GetGroupingParam(out Guid g);
        [PreserveSig] int SetGroupingParam(ref Guid a, ref Guid b);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr n);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr n);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetProcessId(out int pid);
        [PreserveSig] int IsSystemSoundsSession();
    }

    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume
    {
        [PreserveSig] int SetMasterVolume(float level, ref Guid ctx);
        [PreserveSig] int GetMasterVolume(out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    }

    // Undocumented but long-stable interface used by every audio switcher (Win7 - Win11).
    [ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig
    {
        [PreserveSig] int GetMixFormat(); [PreserveSig] int GetDeviceFormat(); [PreserveSig] int ResetDeviceFormat();
        [PreserveSig] int SetDeviceFormat(); [PreserveSig] int GetProcessingPeriod(); [PreserveSig] int SetProcessingPeriod();
        [PreserveSig] int GetShareMode(); [PreserveSig] int SetShareMode(); [PreserveSig] int GetPropertyValue();
        [PreserveSig] int SetPropertyValue();
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
    }

    static class Audio
    {
        static readonly Guid CLSID_Enumerator = new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E");
        static readonly Guid CLSID_PolicyConfig = new Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9");
        static Guid IID_EndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        static Guid IID_Meter = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
        static Guid IID_SessionManager2 = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        static Guid Ctx = Guid.Empty;
        static PROPERTYKEY PKEY_FriendlyName = new PROPERTYKEY(new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), 14);
        static PROPERTYKEY PKEY_DeviceDesc = new PROPERTYKEY(new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), 2);
        const int eRender = 0, eCapture = 1, DEVICE_STATE_ACTIVE = 1;

        [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pv);

        static IMMDeviceEnumerator Enum()
        {
            return (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(CLSID_Enumerator));
        }

        static void Check(int hr, string what) { if (hr < 0) throw new Exception(what + " failed (0x" + hr.ToString("X8") + ")"); }

        static string Prop(IMMDevice d, PROPERTYKEY key)
        {
            IPropertyStore store;
            if (d.OpenPropertyStore(0, out store) < 0) return null;
            PROPVARIANT pv;
            string s = null;
            if (store.GetValue(ref key, out pv) >= 0)
            {
                if (pv.vt == 31 && pv.p != IntPtr.Zero) s = Marshal.PtrToStringUni(pv.p);
                PropVariantClear(ref pv);
            }
            Marshal.ReleaseComObject(store);
            return s;
        }

        static IAudioEndpointVolume Vol(IMMDevice d)
        {
            object o; Check(d.Activate(ref IID_EndpointVolume, 23, IntPtr.Zero, out o), "Activate volume");
            return (IAudioEndpointVolume)o;
        }

        static IMMDevice Get(IMMDeviceEnumerator e, string id, int flow)
        {
            IMMDevice d;
            if (string.IsNullOrEmpty(id)) Check(e.GetDefaultAudioEndpoint(flow, 0, out d), "Default endpoint");
            else Check(e.GetDevice(id, out d), "GetDevice");
            return d;
        }

        static string DefaultId(IMMDeviceEnumerator e, int flow, int role)
        {
            IMMDevice d; if (e.GetDefaultAudioEndpoint(flow, role, out d) < 0) return null;
            string id; d.GetId(out id); Marshal.ReleaseComObject(d); return id;
        }

        static List<object> ListFlow(IMMDeviceEnumerator e, int flow)
        {
            var list = new List<object>();
            string def = DefaultId(e, flow, 0), comm = DefaultId(e, flow, 2);
            IMMDeviceCollection col; Check(e.EnumAudioEndpoints(flow, DEVICE_STATE_ACTIVE, out col), "Enum");
            int n; col.GetCount(out n);
            for (int i = 0; i < n; i++)
            {
                IMMDevice d; col.Item(i, out d);
                string id; d.GetId(out id);
                var item = new Dictionary<string, object>();
                item["id"] = id;
                item["name"] = Prop(d, PKEY_FriendlyName) ?? id;
                item["description"] = Prop(d, PKEY_DeviceDesc);
                item["isDefault"] = id == def;
                item["isDefaultComm"] = id == comm;
                try
                {
                    var v = Vol(d); float lvl; bool m;
                    v.GetMasterVolumeLevelScalar(out lvl); v.GetMute(out m);
                    item["volume"] = (int)Math.Round(lvl * 100); item["muted"] = m;
                    Marshal.ReleaseComObject(v);
                }
                catch { item["volume"] = null; item["muted"] = null; }
                list.Add(item);
                Marshal.ReleaseComObject(d);
            }
            Marshal.ReleaseComObject(col);
            return list;
        }

        public static object List()
        {
            var e = Enum();
            var r = new Dictionary<string, object>();
            r["outputs"] = ListFlow(e, eRender);
            r["inputs"] = ListFlow(e, eCapture);
            Marshal.ReleaseComObject(e);
            return r;
        }

        public static object SetDefault(string id, string roles)
        {
            var pc = (IPolicyConfig)Activator.CreateInstance(Type.GetTypeFromCLSID(CLSID_PolicyConfig));
            // roles: 0 console, 1 multimedia, 2 communications
            if (roles == null || roles == "all" || roles == "default") { Check(pc.SetDefaultEndpoint(id, 0), "SetDefault"); Check(pc.SetDefaultEndpoint(id, 1), "SetDefault"); }
            if (roles == null || roles == "all" || roles == "comm") Check(pc.SetDefaultEndpoint(id, 2), "SetDefault comm");
            Marshal.ReleaseComObject(pc);
            return true;
        }

        static int FlowOf(string flow) { return flow == "input" ? eCapture : eRender; }

        public static object SetVolume(string id, string flow, double volume)
        {
            var e = Enum(); var d = Get(e, id, FlowOf(flow)); var v = Vol(d);
            Check(v.SetMasterVolumeLevelScalar((float)Math.Max(0, Math.Min(1, volume / 100.0)), ref Ctx), "SetVolume");
            Marshal.ReleaseComObject(v); Marshal.ReleaseComObject(d); Marshal.ReleaseComObject(e);
            return true;
        }

        public static object SetMute(string id, string flow, object mute)
        {
            var e = Enum(); var d = Get(e, id, FlowOf(flow)); var v = Vol(d);
            bool cur; v.GetMute(out cur);
            bool target = mute == null ? !cur : Convert.ToBoolean(mute);
            Check(v.SetMute(target, ref Ctx), "SetMute");
            Marshal.ReleaseComObject(v); Marshal.ReleaseComObject(d); Marshal.ReleaseComObject(e);
            return target;
        }

        public static object Peak(string id, string flow)
        {
            var e = Enum(); var d = Get(e, id, FlowOf(flow));
            object o; Check(d.Activate(ref IID_Meter, 23, IntPtr.Zero, out o), "Activate meter");
            float p; ((IAudioMeterInformation)o).GetPeakValue(out p);
            Marshal.ReleaseComObject(o); Marshal.ReleaseComObject(d); Marshal.ReleaseComObject(e);
            return Math.Round(p * 100);
        }

        static List<IAudioSessionControl2> Sessions(IMMDevice d, out IAudioSessionEnumerator en)
        {
            object o; Check(d.Activate(ref IID_SessionManager2, 23, IntPtr.Zero, out o), "Activate sessions");
            var mgr = (IAudioSessionManager2)o;
            Check(mgr.GetSessionEnumerator(out en), "Session enum");
            int n; en.GetCount(out n);
            var list = new List<IAudioSessionControl2>();
            for (int i = 0; i < n; i++) { IAudioSessionControl2 s; if (en.GetSession(i, out s) >= 0) list.Add(s); }
            return list;
        }

        static readonly Dictionary<int, string> nameCache = new Dictionary<int, string>();
        static readonly Dictionary<int, string> pathCache = new Dictionary<int, string>();

        static string ProcName(int pid, out string path)
        {
            path = null;
            if (pid == 0) return "System sounds";
            string n;
            if (nameCache.TryGetValue(pid, out n)) { pathCache.TryGetValue(pid, out path); return n; }
            try
            {
                var p = Process.GetProcessById(pid);
                n = p.ProcessName;
                try { path = p.MainModule.FileName; var fi = FileVersionInfo.GetVersionInfo(path); if (!string.IsNullOrEmpty(fi.FileDescription)) n = fi.FileDescription; } catch { }
            }
            catch { n = "Process " + pid; }
            nameCache[pid] = n; pathCache[pid] = path;
            return n;
        }

        public static object ListSessions(string deviceId)
        {
            var e = Enum(); var d = Get(e, deviceId, eRender);
            IAudioSessionEnumerator en;
            var sessions = Sessions(d, out en);
            // Group sessions by process (browsers create several).
            var byPid = new Dictionary<int, Dictionary<string, object>>();
            foreach (var s in sessions)
            {
                int state; s.GetState(out state);
                int pid; s.GetProcessId(out pid);
                bool system = s.IsSystemSoundsSession() == 0;
                if (system) pid = 0;
                if (state == 2 /*expired*/) { Marshal.ReleaseComObject(s); continue; }
                if (pid != 0) { try { Process.GetProcessById(pid); } catch { Marshal.ReleaseComObject(s); continue; } }
                var sv = (ISimpleAudioVolume)s;
                float lvl; bool m; sv.GetMasterVolume(out lvl); sv.GetMute(out m);
                Dictionary<string, object> item;
                if (!byPid.TryGetValue(pid, out item))
                {
                    string path; string name = ProcName(pid, out path);
                    string disp; s.GetDisplayName(out disp);
                    if (!string.IsNullOrEmpty(disp) && !disp.StartsWith("@")) name = disp;
                    item = new Dictionary<string, object>();
                    item["pid"] = pid; item["name"] = name; item["path"] = path;
                    item["volume"] = (int)Math.Round(lvl * 100); item["muted"] = m; item["active"] = state == 1;
                    byPid[pid] = item;
                }
                else if (state == 1) item["active"] = true;
                Marshal.ReleaseComObject(s);
            }
            Marshal.ReleaseComObject(en); Marshal.ReleaseComObject(d); Marshal.ReleaseComObject(e);
            return new List<object>(byPid.Values);
        }

        public static object SetSession(string deviceId, int pid, object volume, object mute)
        {
            var e = Enum(); var d = Get(e, deviceId, eRender);
            IAudioSessionEnumerator en;
            int touched = 0; object result = null;
            foreach (var s in Sessions(d, out en))
            {
                int spid; s.GetProcessId(out spid);
                if (s.IsSystemSoundsSession() == 0) spid = 0;
                if (spid == pid)
                {
                    var sv = (ISimpleAudioVolume)s;
                    if (volume != null) sv.SetMasterVolume((float)Math.Max(0, Math.Min(1, Convert.ToDouble(volume) / 100.0)), ref Ctx);
                    if (mute != null)
                    {
                        bool target;
                        if (mute is string && (string)mute == "toggle") { bool cur; sv.GetMute(out cur); target = !cur; }
                        else target = Convert.ToBoolean(mute);
                        sv.SetMute(target, ref Ctx); result = target;
                    }
                    touched++;
                }
                Marshal.ReleaseComObject(s);
            }
            Marshal.ReleaseComObject(en); Marshal.ReleaseComObject(d); Marshal.ReleaseComObject(e);
            if (touched == 0) throw new Exception("No audio session for that application");
            return result ?? true;
        }

        // Set volume of every session that belongs to a process name (e.g. "chrome")
        public static object SetSessionByName(string procName, object volume, object mute)
        {
            var e = Enum(); var d = Get(e, null, eRender);
            IAudioSessionEnumerator en; int touched = 0;
            foreach (var s in Sessions(d, out en))
            {
                int pid; s.GetProcessId(out pid);
                try
                {
                    if (pid != 0 && string.Equals(Process.GetProcessById(pid).ProcessName, procName, StringComparison.OrdinalIgnoreCase))
                    {
                        var sv = (ISimpleAudioVolume)s;
                        if (volume != null) sv.SetMasterVolume((float)(Convert.ToDouble(volume) / 100.0), ref Ctx);
                        if (mute != null) sv.SetMute(Convert.ToBoolean(mute), ref Ctx);
                        touched++;
                    }
                }
                catch { }
                Marshal.ReleaseComObject(s);
            }
            Marshal.ReleaseComObject(en); Marshal.ReleaseComObject(d); Marshal.ReleaseComObject(e);
            return touched;
        }
    }
}
