// Windows System Media Transport Controls (Global Media Controls). Chrome / Edge / the
// installed YouTube Music web app publish title, artist, artwork and timeline here via the
// browser MediaSession API, so this works for YouTube Music without any extension.
using System;
using System.Collections.Generic;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace PadDeck
{
    static class Media
    {
        static GlobalSystemMediaTransportControlsSessionManager mgr;
        static readonly Dictionary<string, string> artCache = new Dictionary<string, string>();

        static T W<T>(IAsyncOperation<T> op)
        {
            var until = DateTime.UtcNow.AddSeconds(5);
            while (op.Status == AsyncStatus.Started) { if (DateTime.UtcNow > until) throw new TimeoutException("WinRT call timed out"); Thread.Sleep(3); }
            if (op.Status != AsyncStatus.Completed) throw new Exception("WinRT call " + op.Status + (op.ErrorCode != null ? ": " + op.ErrorCode.Message : ""));
            return op.GetResults();
        }

        static GlobalSystemMediaTransportControlsSessionManager Mgr()
        {
            if (mgr == null) mgr = W(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
            return mgr;
        }

        static string Art(IRandomAccessStreamReference thumb, string key)
        {
            if (thumb == null) return null;
            string cached;
            lock (artCache) { if (artCache.TryGetValue(key, out cached)) return cached; }
            try
            {
                var stream = W(thumb.OpenReadAsync());
                uint size = (uint)stream.Size;
                if (size == 0 || size > 4 * 1024 * 1024) return null;
                var reader = new DataReader(stream.GetInputStreamAt(0));
                W(reader.LoadAsync(size));
                var bytes = new byte[size];
                reader.ReadBytes(bytes);
                string mime = string.IsNullOrEmpty(stream.ContentType) ? "image/png" : stream.ContentType;
                string uri = "data:" + mime + ";base64," + Convert.ToBase64String(bytes);
                lock (artCache) { if (artCache.Count > 30) artCache.Clear(); artCache[key] = uri; }
                return uri;
            }
            catch { return null; }
        }

        public static object State(bool withArt)
        {
            var m = Mgr();
            var cur = m.GetCurrentSession();
            string curId = cur != null ? cur.SourceAppUserModelId : null;
            var list = new List<object>();
            foreach (var s in m.GetSessions())
            {
                var d = new Dictionary<string, object>();
                d["appId"] = s.SourceAppUserModelId;
                d["isCurrent"] = s.SourceAppUserModelId == curId;
                try
                {
                    var p = W(s.TryGetMediaPropertiesAsync());
                    d["title"] = p.Title; d["artist"] = p.Artist; d["album"] = p.AlbumTitle; d["albumArtist"] = p.AlbumArtist;
                    if (withArt) d["art"] = Art(p.Thumbnail, s.SourceAppUserModelId + "|" + p.Title + "|" + p.Artist);
                }
                catch (Exception ex) { d["error"] = ex.Message; }
                var pb = s.GetPlaybackInfo();
                d["status"] = pb.PlaybackStatus.ToString().ToLowerInvariant();
                var c = pb.Controls;
                d["canPlay"] = c.IsPlayEnabled; d["canPause"] = c.IsPauseEnabled; d["canNext"] = c.IsNextEnabled;
                d["canPrev"] = c.IsPreviousEnabled; d["canSeek"] = c.IsPlaybackPositionEnabled;
                var t = s.GetTimelineProperties();
                double pos = t.Position.TotalSeconds;
                // Browsers report the position at LastUpdatedTime; extrapolate while playing.
                if (pb.PlaybackStatus == GlobalSystemMediaTransportControlsSessionPlaybackStatus.Playing && t.LastUpdatedTime.Year > 2000)
                {
                    double since = (DateTimeOffset.Now - t.LastUpdatedTime).TotalSeconds;
                    if (since > 0 && since < 3600) pos += since * (pb.PlaybackRate.HasValue ? pb.PlaybackRate.Value : 1.0);
                }
                double end = (t.EndTime - t.StartTime).TotalSeconds;
                if (end > 0 && pos > end) pos = end;
                d["position"] = Math.Round(pos, 1); d["duration"] = Math.Round(end, 1);
                list.Add(d);
            }
            return list;
        }

        static GlobalSystemMediaTransportControlsSession Find(string appId)
        {
            var m = Mgr();
            if (!string.IsNullOrEmpty(appId))
                foreach (var s in m.GetSessions()) if (s.SourceAppUserModelId == appId) return s;
            var cur = m.GetCurrentSession();
            if (cur == null) throw new Exception("No media session is active");
            return cur;
        }

        public static object Control(string appId, string action, double position)
        {
            var s = Find(appId);
            bool ok;
            switch (action)
            {
                case "play": ok = W(s.TryPlayAsync()); break;
                case "pause": ok = W(s.TryPauseAsync()); break;
                case "toggle": ok = W(s.TryTogglePlayPauseAsync()); break;
                case "next": ok = W(s.TrySkipNextAsync()); break;
                case "prev": ok = W(s.TrySkipPreviousAsync()); break;
                case "stop": ok = W(s.TryStopAsync()); break;
                case "seek":
                    var t = s.GetTimelineProperties();
                    ok = W(s.TryChangePlaybackPositionAsync((t.StartTime + TimeSpan.FromSeconds(position)).Ticks));
                    break;
                default: throw new Exception("Unknown media action " + action);
            }
            if (!ok) throw new Exception("The media app rejected '" + action + "'");
            return true;
        }
    }
}
