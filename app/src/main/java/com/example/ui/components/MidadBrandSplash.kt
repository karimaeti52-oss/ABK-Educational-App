package com.example.ui.components

import android.animation.ValueAnimator
import android.content.Context
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.R
import com.example.ui.theme.MidadGold
import com.example.ui.theme.MidadGoldLight
import com.example.ui.theme.MidadIvory
import com.example.ui.theme.MidadNavyDeep
import com.example.ui.theme.MidadNavyIconBg
import com.example.ui.theme.MidadTurquoise
import kotlinx.coroutines.delay

fun isReducedMotionEnabled(context: Context): Boolean {
    val scale = runCatching {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f
        )
    }.getOrDefault(1f)
    val animatorsEnabled = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        runCatching { ValueAnimator.areAnimatorsEnabled() }.getOrDefault(true)
    } else {
        true
    }
    return scale == 0f || !animatorsEnabled
}

@Composable
fun MidadEmblem(
    modifier: Modifier = Modifier,
    capRotationDegrees: Float = 0f,
    showBadgeBackground: Boolean = true
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val cx = w / 2f

        if (showBadgeBackground) {
            drawRoundRect(
                brush = Brush.linearGradient(
                    colors = listOf(MidadNavyDeep, MidadNavyIconBg)
                ),
                cornerRadius = CornerRadius(w * 0.24f, w * 0.24f),
                size = size
            )
            // Subtle inner gold hairline
            drawRoundRect(
                color = MidadGold.copy(alpha = 0.35f),
                topLeft = Offset(w * 0.04f, h * 0.04f),
                size = Size(w * 0.92f, h * 0.92f),
                cornerRadius = CornerRadius(w * 0.21f, w * 0.21f),
                style = Stroke(width = w * 0.015f)
            )
        }

        // Open book pages (Lower 52% of emblem)
        val bookTopY = h * 0.48f
        val bookBottomY = h * 0.77f
        val leftBookPath = Path().apply {
            moveTo(cx - w * 0.02f, bookBottomY)
            quadraticTo(cx - w * 0.16f, bookBottomY - h * 0.04f, cx - w * 0.32f, bookBottomY - h * 0.01f)
            lineTo(cx - w * 0.30f, bookTopY)
            quadraticTo(cx - w * 0.15f, bookTopY - h * 0.04f, cx - w * 0.02f, bookTopY + h * 0.03f)
            close()
        }
        val rightBookPath = Path().apply {
            moveTo(cx + w * 0.02f, bookBottomY)
            quadraticTo(cx + w * 0.16f, bookBottomY - h * 0.04f, cx + w * 0.32f, bookBottomY - h * 0.01f)
            lineTo(cx + w * 0.30f, bookTopY)
            quadraticTo(cx + w * 0.15f, bookTopY - h * 0.04f, cx + w * 0.02f, bookTopY + h * 0.03f)
            close()
        }
        drawPath(leftBookPath, color = MidadIvory)
        drawPath(rightBookPath, color = Color.White)

        // Turquoise ribbon / knowledge arc beneath book
        val arcPath = Path().apply {
            moveTo(cx - w * 0.24f, h * 0.81f)
            quadraticTo(cx, h * 0.75f, cx + w * 0.24f, h * 0.81f)
        }
        drawPath(
            path = arcPath,
            color = MidadTurquoise,
            style = Stroke(width = w * 0.04f, cap = StrokeCap.Round)
        )

        // Gold fountain pen nib emerging gently from the spine
        val nibPath = Path().apply {
            moveTo(cx, h * 0.41f)
            lineTo(cx - w * 0.045f, h * 0.56f)
            lineTo(cx, h * 0.64f)
            lineTo(cx + w * 0.045f, h * 0.56f)
            close()
        }
        drawPath(nibPath, color = MidadGold)

        // Floating Graduation Cap above book (pivots & wobbles cleanly)
        val capPivot = Offset(cx, h * 0.32f)
        rotate(degrees = capRotationDegrees, pivot = capPivot) {
            val mortarboard = Path().apply {
                moveTo(cx, h * 0.16f)
                lineTo(cx + w * 0.25f, h * 0.26f)
                lineTo(cx, h * 0.35f)
                lineTo(cx - w * 0.25f, h * 0.26f)
                close()
            }
            drawPath(mortarboard, color = MidadTurquoise)
            drawPath(
                mortarboard,
                color = MidadGoldLight,
                style = Stroke(width = w * 0.018f)
            )
            // Cap base crown
            drawRoundRect(
                color = MidadNavyIconBg,
                topLeft = Offset(cx - w * 0.13f, h * 0.29f),
                size = Size(w * 0.26f, h * 0.085f),
                cornerRadius = CornerRadius(w * 0.03f, w * 0.03f)
            )
            // Gold tassel
            drawLine(
                color = MidadGold,
                start = Offset(cx + w * 0.20f, h * 0.26f),
                end = Offset(cx + w * 0.20f, h * 0.39f),
                strokeWidth = w * 0.022f,
                cap = StrokeCap.Round
            )
            drawCircle(
                color = MidadGold,
                radius = w * 0.025f,
                center = Offset(cx + w * 0.20f, h * 0.40f)
            )
        }
    }
}

@Composable
fun MidadSplashIntro(
    onFinished: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val emblemAlpha = remember { Animatable(0f) }
    val emblemScale = remember { Animatable(0.92f) }
    val capRotation = remember { Animatable(0f) }
    val textAlpha = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        if (isReducedMotionEnabled(context)) {
            onFinished()
            return@LaunchedEffect
        }
        emblemAlpha.animateTo(1f, tween(220, easing = FastOutSlowInEasing))
        emblemScale.animateTo(1f, tween(240, easing = FastOutSlowInEasing))

        // Gentle double wobble of graduation cap above the open book (~620ms)
        val wobbleAngles = listOf(-10f, 10f, -6f, 5f, 0f)
        for (angle in wobbleAngles) {
            capRotation.animateTo(
                targetValue = angle,
                animationSpec = tween(durationMillis = 120, easing = FastOutSlowInEasing)
            )
        }
        textAlpha.animateTo(1f, tween(220, easing = FastOutSlowInEasing))
        delay(160L)
        onFinished()
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(MidadNavyDeep, MidadNavyIconBg, Color(0xFF0E2136))
                )
            )
            .padding(24.dp)
            .testTag("midad_splash_intro"),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            MidadEmblem(
                capRotationDegrees = capRotation.value,
                showBadgeBackground = true,
                modifier = Modifier
                    .size(128.dp)
                    .graphicsLayer(
                        alpha = emblemAlpha.value,
                        scaleX = emblemScale.value,
                        scaleY = emblemScale.value
                    )
                    .testTag("midad_splash_emblem")
            )

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.graphicsLayer(alpha = textAlpha.value)
            ) {
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold),
                    color = Color.White,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.testTag("midad_splash_title")
                )
                Surface(
                    shape = RoundedCornerShape(100.dp),
                    color = MidadGold.copy(alpha = 0.16f)
                ) {
                    Text(
                        text = stringResource(R.string.platform_tagline),
                        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MidadGoldLight,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)
                    )
                }
                Spacer(Modifier.height(6.dp))
            }
        }
    }
}
