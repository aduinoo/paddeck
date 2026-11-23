// PadDeckHelper: a small native process driven by the Node companion over stdin/stdout.
// Protocol: one JSON object per line. Request {"id":1,"cmd":"audio.list","args":{...}}
// Response {"id":1,"ok":true,"result":...} or {"id":1,"ok":false,"error":"..."}.
// Events  {"event":"name","data":...}
using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

namespace PadDeck
{
    static class Program
    {
        static readonly object outLock = new object();
        static TextWriter stdout;
        static readonly JavaScriptSerializer json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };

        public static void Emit(string evt, object data)
        {
            var d = new Dictionary<string, object>(); d["event"] = evt; d["data"] = data;
            Write(d);
        }

        static void Write(object o)
        {
            string s = json.Serialize(o);
            lock (outLock) { stdout.Write(s); stdout.Write('\n'); stdout.Flush(); }
        }

        [STAThread]
        static int Main(string[] argv)
        {
            SystemOps.InitDpi();
            stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = false };
            var stdin = new StreamReader(Console.OpenStandardInput(), new UTF8Encoding(false));
            bool noTray = Array.IndexOf(argv, "--no-tray") >= 0;

            Sound.Start();
            Sound.OnEnded = (key, err) => { var d = new Dictionary<string, object>(); d["key"] = key; d["error"] = err; Emit("sound.ended", d); };
            if (!noTray) SystemOps.StartTray("PadDeck companion");
            Emit("ready", new Dictionary<string, object> { { "pid", System.Diagnostics.Process.GetCurrentProcess().Id } });

            string line;
            while ((line = stdin.ReadLine()) != null)
            {
                if (line.Length == 0) continue;
                Dictionary<string, object> req;
                try { req = json.Deserialize<Dictionary<string, object>>(line); }
                catch { continue; }
                string cmd = Str(req, "cmd");
                // Low-latency, order-sensitive commands run inline; everything else on the pool.
                if (cmd == "pen" || cmd == "touch" || cmd.StartsWith("keys.")) Handle(req);
                else ThreadPool.QueueUserWorkItem(_ => Handle(req));
            }
            Input.Shutdown();
            SystemOps.HideTray();
            return 0;
        }

        static string Str(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) && v != null ? Convert.ToString(v) : null; }
        static double Num(Dictionary<string, object> d, string k, double def) { object v; return d != null && d.TryGetValue(k, out v) && v != null ? Convert.ToDouble(v) : def; }
        static bool Bool(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) && v != null && Convert.ToBoolean(v); }
        static object Obj(Dictionary<string, object> d, string k) { object v; return d != null && d.TryGetValue(k, out v) ? v : null; }

        static void Handle(Dictionary<string, object> req)
        {
            object id = Obj(req, "id");
            string cmd = Str(req, "cmd");
            var a = Obj(req, "args") as Dictionary<string, object> ?? new Dictionary<string, object>();
            var res = new Dictionary<string, object>(); res["id"] = id;
            try
            {
                res["result"] = Dispatch(cmd, a);
                res["ok"] = true;
            }
            catch (Exception ex)
            {
                var inner = ex; while (inner.InnerException != null) inner = inner.InnerException;
                res["ok"] = false; res["error"] = inner.Message;
            }
            // pen/touch are fire-and-forget unless they fail
            if (id == null && (bool)res["ok"]) return;
            Write(res);
        }

        static object Dispatch(string cmd, Dictionary<string, object> a)
        {
            switch (cmd)
            {
                case "ping": return "pong";
                case "audio.list": return Audio.List();
                case "audio.setDefault": return Audio.SetDefault(Str(a, "id"), Str(a, "roles"));
                case "audio.setVolume": return Audio.SetVolume(Str(a, "id"), Str(a, "flow"), Num(a, "volume", 0));
                case "audio.setMute": return Audio.SetMute(Str(a, "id"), Str(a, "flow"), Obj(a, "mute"));
                case "audio.peak": return Audio.Peak(Str(a, "id"), Str(a, "flow"));
                case "audio.sessions": return Audio.ListSessions(Str(a, "deviceId"));
                case "audio.setSession": return Audio.SetSession(Str(a, "deviceId"), (int)Num(a, "pid", -1), Obj(a, "volume"), Obj(a, "mute"));
                case "audio.setSessionByName": return Audio.SetSessionByName(Str(a, "name"), Obj(a, "volume"), Obj(a, "mute"));
                case "keys.combo": return Input.Combo((System.Collections.IList)Obj(a, "keys") as IList<object> ?? ToList(Obj(a, "keys")), (int)Num(a, "holdMs", 0));
                case "keys.state": return Input.KeyState(Str(a, "key"), Bool(a, "down"));
                case "keys.text": return Input.Text(Str(a, "text") ?? "");
                case "mouse.scroll": return Input.Scroll((int)Num(a, "dy", 0), (int)Num(a, "dx", 0));
                case "pen":
                    return Input.Pen(Str(a, "phase"), (int)Num(a, "x", 0), (int)Num(a, "y", 0), Num(a, "p", 0),
                        (int)Num(a, "tx", 0), (int)Num(a, "ty", 0), (int)Num(a, "r", 0), Bool(a, "b"), Bool(a, "e"));
                case "touch": return Input.Touch(ToList(Obj(a, "contacts")));
                case "media.state": return Media.State(Bool(a, "art"));
                case "media.control": return Media.Control(Str(a, "appId"), Str(a, "action"), Num(a, "position", 0));
                case "sound.play": return Sound.Play(Str(a, "key"), Str(a, "path"), Num(a, "volume", 100), Bool(a, "exclusive"));
                case "sound.stop": return Sound.Stop(Str(a, "key"));
                case "sound.master": return Sound.SetMaster(Num(a, "volume", 100));
                case "sound.playing": return Sound.Playing();
                case "sys.screens": return SystemOps.Screens();
                case "sys.shellExecute": return SystemOps.ShellExecute(Str(a, "file"), Str(a, "args"), Str(a, "verb"), Str(a, "cwd"));
                case "sys.shellIcon": return SystemOps.ShellIcon(Str(a, "name"), (int)Num(a, "size", 96));
                case "sys.net": return SystemOps.Net();
                case "sys.cursor": return SystemOps.Cursor();
                case "sys.pointerDevices": return SystemOps.PointerDevices();
                case "sys.drives": return SystemOps.Drives();
                case "sys.lock": return SystemOps.Lock();
                case "sys.sleep": return SystemOps.Sleep();
                case "sys.screenshot": return SystemOps.Screenshot(Str(a, "dir"));
                case "sys.icon": return SystemOps.Icon(Str(a, "path"), (int)Num(a, "size", 32));
                case "sys.notify": return SystemOps.Notify(Str(a, "title"), Str(a, "text"));
                case "sys.trayText": return SystemOps.SetTrayText(Str(a, "text") ?? "PadDeck");
                default: throw new Exception("Unknown command: " + cmd);
            }
        }

        static IList<object> ToList(object o)
        {
            var list = new List<object>();
            var arr = o as System.Collections.IEnumerable;
            if (arr != null && !(o is string)) foreach (var x in arr) list.Add(x);
            return list;
        }
    }
}
