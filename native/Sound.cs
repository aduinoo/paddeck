// Soundboard playback on the PC's default output using WPF MediaPlayer (Media Foundation):
// MP3, WAV, and OGG (OGG via the Web Media Extensions that ship with Windows 11).
using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Media;
using System.Windows.Threading;

namespace PadDeck
{
    static class Sound
    {
        static Dispatcher dispatcher;
        static readonly Dictionary<string, List<MediaPlayer>> playing = new Dictionary<string, List<MediaPlayer>>();
        static double master = 1.0;
        static readonly Dictionary<MediaPlayer, double> baseVol = new Dictionary<MediaPlayer, double>();
        public static Action<string, string> OnEnded;

        public static void Start()
        {
            var ready = new ManualResetEvent(false);
            var t = new Thread(() =>
            {
                dispatcher = Dispatcher.CurrentDispatcher;
                ready.Set();
                Dispatcher.Run();
            });
            t.SetApartmentState(ApartmentState.STA);
            t.IsBackground = true;
            t.Start();
            ready.WaitOne();
        }

        static T Invoke<T>(Func<T> f) { return (T)dispatcher.Invoke(f); }

        public static object Play(string key, string path, double volume, bool exclusive)
        {
            return Invoke<object>(() =>
            {
                if (!System.IO.File.Exists(path)) throw new Exception("Sound file not found");
                List<MediaPlayer> list;
                if (!playing.TryGetValue(key, out list)) { list = new List<MediaPlayer>(); playing[key] = list; }
                if (exclusive) { foreach (var p in list) p.Close(); list.Clear(); }
                var mp = new MediaPlayer();
                mp.Volume = Math.Max(0, Math.Min(1, volume / 100.0)) * master;
                baseVol[mp] = volume;
                string err = null;
                mp.MediaFailed += (s, e) => { err = e.ErrorException != null ? e.ErrorException.Message : "Media failed"; Remove(key, mp); if (OnEnded != null) OnEnded(key, err); };
                mp.MediaEnded += (s, e) => { Remove(key, mp); if (OnEnded != null) OnEnded(key, null); };
                mp.Open(new Uri(path));
                mp.Play();
                list.Add(mp);
                return true;
            });
        }

        static void Remove(string key, MediaPlayer mp)
        {
            mp.Close(); baseVol.Remove(mp);
            List<MediaPlayer> list;
            if (playing.TryGetValue(key, out list)) { list.Remove(mp); if (list.Count == 0) playing.Remove(key); }
        }

        public static object Stop(string key)
        {
            return Invoke<object>(() =>
            {
                List<MediaPlayer> list;
                if (key == null) { foreach (var l in playing.Values) foreach (var p in l) p.Close(); playing.Clear(); return true; }
                if (playing.TryGetValue(key, out list)) { foreach (var p in list) p.Close(); playing.Remove(key); }
                return true;
            });
        }

        public static object SetMaster(double v)
        {
            return Invoke<object>(() =>
            {
                master = Math.Max(0, Math.Min(1, v / 100.0));
                foreach (var l in playing.Values) foreach (var p in l) { double bv; p.Volume = (baseVol.TryGetValue(p, out bv) ? bv / 100.0 : 1) * master; }
                return true;
            });
        }

        public static object Playing()
        {
            return Invoke<object>(() => new List<string>(playing.Keys));
        }
    }
}
