package com.example.ui.theme

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

enum class ThemePreferenceMode(val labelAr: String) {
    SYSTEM("تلقائي"),
    LIGHT("فاتح"),
    DARK("داكن");

    companion object {
        fun fromString(raw: String?): ThemePreferenceMode =
            entries.firstOrNull { it.name == raw } ?: SYSTEM
    }
}

private val Context.midadPrefsDataStore: DataStore<Preferences> by preferencesDataStore(name = "midad_ui_prefs")

object ThemePreferences {
    private val KEY_THEME_MODE = stringPreferencesKey("theme_mode")

    fun observeThemeMode(context: Context): Flow<ThemePreferenceMode> {
        return context.applicationContext.midadPrefsDataStore.data
            .catch { emit(androidx.datastore.preferences.core.emptyPreferences()) }
            .map { prefs -> ThemePreferenceMode.fromString(prefs[KEY_THEME_MODE]) }
    }

    suspend fun setThemeMode(context: Context, mode: ThemePreferenceMode) {
        context.applicationContext.midadPrefsDataStore.edit { prefs ->
            prefs[KEY_THEME_MODE] = mode.name
        }
    }
}
