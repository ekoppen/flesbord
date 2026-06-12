package nl.defles.bord;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Start het bord automatisch na het opstarten van de TV. Nieuwere
 * Android-versies kunnen dit blokkeren; in dat geval start je de app
 * gewoon vanaf het startscherm.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        try {
            Intent i = new Intent(context, MainActivity.class);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(i);
        } catch (Exception e) {
            // Door het systeem geblokkeerd: stilzwijgend negeren.
        }
    }
}
