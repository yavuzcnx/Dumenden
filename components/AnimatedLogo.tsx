import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { Animated, Easing, StyleSheet } from 'react-native'

const AnimatedLogo = forwardRef((_, ref) => {
  const scale = useRef(new Animated.Value(1)).current
  const rotate = useRef(new Animated.Value(0)).current

  useImperativeHandle(ref, () => ({
    playAnimation: () => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.4,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(rotate, {
            toValue: 1,
            duration: 300,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]).start()
    },
  }))

  const rotateInterpolate = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '10deg'],
  })

  return (
    <Animated.Image
      source={require('../assets/images/logo.png')}
      style={[
        styles.logo,
        {
          transform: [{ scale }, { rotate: rotateInterpolate }],
        },
      ]}
    />
  )
})

export default AnimatedLogo

const styles = StyleSheet.create({
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: 20,
  },
})
