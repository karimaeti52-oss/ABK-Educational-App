package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.example.data.model.PlatformConfig

private val LightColorScheme = lightColorScheme(
    primary = AbkNavyDeep,
    onPrimary = AbkWhite,
    primaryContainer = AbkSkyContainer,
    onPrimaryContainer = AbkNavyOnContainer,
    secondary = AbkSkyPrimary,
    onSecondary = AbkWhite,
    secondaryContainer = Color(0xFFBAE6FD),
    onSecondaryContainer = AbkNavyDeep,
    tertiary = AbkNavyPrimary,
    onTertiary = AbkWhite,
    background = AbkWhite,
    onBackground = AbkTextPrimaryLight,
    surface = AbkWhite,
    onSurface = AbkTextPrimaryLight,
    surfaceVariant = AbkSurfaceVariantLight,
    onSurfaceVariant = AbkTextSecondaryLight,
    outline = AbkBorderLight,
    outlineVariant = Color(0xFFF1F5F9),
    error = AbkError,
    onError = AbkWhite,
    errorContainer = AbkErrorContainer,
    onErrorContainer = Color(0xFF7F1D1D)
)

private val DarkColorScheme = darkColorScheme(
    primary = AbkSkyLight,
    onPrimary = AbkNavyDeep,
    primaryContainer = AbkNavyPrimary,
    onPrimaryContainer = AbkSkyContainer,
    secondary = AbkSkyPrimary,
    onSecondary = AbkNavyDeep,
    secondaryContainer = AbkSurfaceVariantDark,
    onSecondaryContainer = AbkSkyLight,
    tertiary = AbkSkyLight,
    onTertiary = AbkNavyDeep,
    background = AbkBackgroundDark,
    onBackground = AbkTextPrimaryDark,
    surface = AbkSurfaceDark,
    onSurface = AbkTextPrimaryDark,
    surfaceVariant = AbkSurfaceVariantDark,
    onSurfaceVariant = AbkTextSecondaryDark,
    outline = Color(0xFF1E3A5F),
    outlineVariant = Color(0xFF152946),
    error = Color(0xFFF87171),
    onError = Color(0xFF450A0A),
    errorContainer = Color(0xFF7F1D1D),
    onErrorContainer = Color(0xFFFECACA)
)

val AbkShapes = Shapes(
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(22.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

fun parseSafeHexColor(hex: String?, fallback: Color): Color {
    val clean = hex?.trim().orEmpty()
    if (!clean.startsWith("#") || (clean.length != 7 && clean.length != 9)) return fallback
    return runCatching {
        Color(android.graphics.Color.parseColor(clean))
    }.getOrDefault(fallback)
}

@Composable
fun ABKTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    platformConfig: PlatformConfig? = null,
    content: @Composable () -> Unit
) {
    val dynamicPrimary = remember(platformConfig?.primaryColorHex) {
        parseSafeHexColor(platformConfig?.primaryColorHex, AbkNavyDeep)
    }
    val dynamicSecondary = remember(platformConfig?.secondaryColorHex) {
        parseSafeHexColor(platformConfig?.secondaryColorHex, AbkSkyPrimary)
    }
    val dynamicAccent = remember(platformConfig?.accentColorHex) {
        parseSafeHexColor(platformConfig?.accentColorHex, AbkSkyLight)
    }

    val colorScheme = if (darkTheme) {
        DarkColorScheme.copy(
            primary = dynamicAccent,
            secondary = dynamicSecondary,
            primaryContainer = dynamicPrimary
        )
    } else {
        LightColorScheme.copy(
            primary = dynamicPrimary,
            secondary = dynamicSecondary,
            onPrimaryContainer = dynamicPrimary
        )
    }

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = AbkTypography,
            shapes = AbkShapes,
            content = content
        )
    }
}
